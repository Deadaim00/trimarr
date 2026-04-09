import { processFilePlan } from "@/lib/process";
import {
  countRunningPlans,
  getQueueBatchState,
  getSettings,
  listQueuedPlans,
  setQueueBatchState,
  tryStartProcessing,
  writeAppLog,
} from "@/lib/storage";
import { SERVER_LOCAL_TIMEZONE } from "@/lib/config";

let queueBatchInFlight = false;

function nowIso(): string {
  return new Date().toISOString();
}

function nextQueuedMediaFileId(): string | null {
  return listQueuedPlans(100000).find((plan) => plan.processingState === "queued")?.mediaFileId ?? null;
}

function activeProcessorLabel(count: number): string {
  return count === 1 ? "1 active processor" : `${count} active processors`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function detectedServerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || "UTC";
}

function resolveSchedulerTimeZone(configured: string): string {
  return configured === SERVER_LOCAL_TIMEZONE ? detectedServerTimeZone() : configured;
}

function timeKeyInZone(timeZone: string, date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.get("hour") ?? "00"}:${parts.get("minute") ?? "00"}`;
}

function isWithinSchedulerWindow(runAt: string, endAt: string, timeZone: string): boolean {
  const now = timeKeyInZone(timeZone);
  if (runAt === endAt) {
    return true;
  }

  if (runAt < endAt) {
    return now >= runAt && now < endAt;
  }

  return now >= runAt || now < endAt;
}

export function requestQueueBatchStop(): void {
  const current = getQueueBatchState();
  if (current.status !== "running") {
    return;
  }

  setQueueBatchState({
    ...current,
    status: "stopping",
    updatedAt: nowIso(),
    message: "Stopping after active processors finish.",
  });
  writeAppLog("info", "queue", "Queue batch stop requested", "Trimarr will stop after the active processors finish.");
}

export function startQueueBatch(source: "manual" | "scheduler" | "webhook" = "manual"): boolean {
  const current = getQueueBatchState();
  if (queueBatchInFlight || current.status === "running" || current.status === "stopping") {
    return false;
  }

  queueBatchInFlight = true;
  const startedAt = nowIso();
  setQueueBatchState({
    status: "running",
    source,
    startedAt,
    updatedAt: startedAt,
    message: "Processing queued files.",
  });
  writeAppLog("info", "queue", "Queue batch started", `Source: ${source}`);

  void runQueueBatch(source).finally(() => {
    queueBatchInFlight = false;
  });

  return true;
}

async function runQueueBatch(source: "manual" | "scheduler" | "webhook"): Promise<void> {
  let processed = 0;
  const activeJobs = new Map<string, Promise<void>>();

  while (true) {
    const state = getQueueBatchState();
    const settings = getSettings();
    const maxConcurrentJobs = Math.min(4, Math.max(1, settings.maxConcurrentJobs || 1));

    if (source === "scheduler") {
      const timeZone = resolveSchedulerTimeZone(settings.scheduleTimeZone);
      if (!isWithinSchedulerWindow(settings.scheduleRunAt, settings.scheduleEndAt, timeZone)) {
        if (activeJobs.size > 0) {
          setQueueBatchState({
            status: "stopping",
            source,
            startedAt: state.startedAt ?? nowIso(),
            updatedAt: nowIso(),
            message: `Scheduler window closed. Waiting for ${activeProcessorLabel(activeJobs.size)} to finish.`,
          });
          await Promise.race(activeJobs.values());
          continue;
        }

        setQueueBatchState({
          status: "idle",
          source,
          startedAt: null,
          updatedAt: nowIso(),
          message:
            processed > 0
              ? `Stopped at scheduler end time after ${processed} file(s).`
              : `Scheduler window closed at ${settings.scheduleEndAt}.`,
        });
        writeAppLog(
          "info",
          "queue",
          "Queue batch stopped at scheduler end time",
          `End time ${settings.scheduleEndAt} reached in ${timeZone}. Processed ${processed} file(s).`,
        );
        return;
      }
    }

    if (state.status === "stopping") {
      if (activeJobs.size > 0) {
        setQueueBatchState({
          status: "stopping",
          source,
          startedAt: state.startedAt ?? nowIso(),
          updatedAt: nowIso(),
          message: `Stopping after ${activeProcessorLabel(activeJobs.size)} finish.`,
        });
        await Promise.race(activeJobs.values());
        continue;
      }

      setQueueBatchState({
        status: "idle",
        source,
        startedAt: null,
        updatedAt: nowIso(),
        message: processed > 0 ? `Stopped after processing ${processed} file(s).` : "Stopped before starting the next file.",
      });
      writeAppLog("info", "queue", "Queue batch stopped", `Processed ${processed} file(s) before stopping.`);
      return;
    }

    let dispatched = 0;
    while (activeJobs.size < maxConcurrentJobs) {
      const mediaFileId = nextQueuedMediaFileId();
      if (!mediaFileId) {
        break;
      }

      if (!tryStartProcessing(mediaFileId, "Preparing remux", maxConcurrentJobs)) {
        break;
      }

      dispatched += 1;
      setQueueBatchState({
        status: "running",
        source,
        startedAt: state.startedAt ?? nowIso(),
        updatedAt: nowIso(),
        message: `Running ${activeProcessorLabel(countRunningPlans())}.`,
      });

      const job = processFilePlan(mediaFileId)
        .then(() => {
          processed += 1;
        })
        .catch(() => {
          // Failure state is persisted by the processor. Failed items stay failed until manually retried.
        })
        .finally(() => {
          activeJobs.delete(mediaFileId);
        });

      activeJobs.set(mediaFileId, job);
    }

    const mediaFileId = nextQueuedMediaFileId();
    if (!mediaFileId && activeJobs.size === 0) {
      setQueueBatchState({
        status: "idle",
        source,
        startedAt: null,
        updatedAt: nowIso(),
        message: processed > 0 ? `Processed ${processed} file(s).` : "No queued files to process.",
      });
      writeAppLog("info", "queue", "Queue batch completed", `Processed ${processed} file(s).`);
      return;
    }

    if (activeJobs.size > 0) {
      if (dispatched > 0) {
        setQueueBatchState({
          status: "running",
          source,
          startedAt: state.startedAt ?? nowIso(),
          updatedAt: nowIso(),
          message: `Running ${activeProcessorLabel(activeJobs.size)}.`,
        });
      }
      await Promise.race(activeJobs.values());
      continue;
    }

    if (countRunningPlans() >= maxConcurrentJobs) {
      setQueueBatchState({
        status: "running",
        source,
        startedAt: state.startedAt ?? nowIso(),
        updatedAt: nowIso(),
        message: `Waiting for capacity. ${activeProcessorLabel(countRunningPlans())} already in use.`,
      });
      await delay(500);
      continue;
    }

    setQueueBatchState({
      status: "idle",
      source,
      startedAt: null,
      updatedAt: nowIso(),
      message: processed > 0 ? `Processed ${processed} file(s).` : "No queued files to process.",
    });
    writeAppLog("warn", "queue", "Queue batch exited without dispatching work", "Queued items could not be started.");
    return;
  }
}
