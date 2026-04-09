import { processFilePlan } from "@/lib/process";
import {
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
    message: "Stopping after current file finishes.",
  });
  writeAppLog("info", "queue", "Queue batch stop requested", "Trimarr will stop after the current file finishes.");
}

export function startQueueBatch(source: "manual" | "scheduler" = "manual"): boolean {
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

async function runQueueBatch(source: "manual" | "scheduler"): Promise<void> {
  let processed = 0;

  while (true) {
    const state = getQueueBatchState();
    if (source === "scheduler") {
      const settings = getSettings();
      const timeZone = resolveSchedulerTimeZone(settings.scheduleTimeZone);
      if (!isWithinSchedulerWindow(settings.scheduleRunAt, settings.scheduleEndAt, timeZone)) {
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

    const mediaFileId = nextQueuedMediaFileId();
    if (!mediaFileId) {
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

    if (!tryStartProcessing(mediaFileId, "Preparing remux")) {
      continue;
    }

    setQueueBatchState({
      status: "running",
      source,
      startedAt: state.startedAt ?? nowIso(),
      updatedAt: nowIso(),
      message: `Processing file ${processed + 1}`,
    });

    try {
      await processFilePlan(mediaFileId);
      processed += 1;
    } catch {
      // Failure state is persisted by the processor. Failed items stay failed until manually retried.
    }
  }
}
