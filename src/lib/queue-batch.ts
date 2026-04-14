import { processFilePlan } from "@/lib/process";
import {
  countRunningPlans,
  getNextQueuedMediaFileId,
  getQueueBatchState,
  getSettings,
  setQueueBatchState,
  tryStartProcessing,
  writeAppLog,
} from "@/lib/storage";
import {
  hasReachedConfiguredSchedulerEndSince,
  isWithinConfiguredSchedulerWindow,
  resolveSchedulerTimeZone,
} from "@/lib/scheduler-window";

let queueBatchInFlight = false;

function nowIso(): string {
  return new Date().toISOString();
}

function activeProcessorLabel(count: number): string {
  return count === 1 ? "1 active processor" : `${count} active processors`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

    if (source !== "manual" && hasReachedConfiguredSchedulerEndSince(settings, state.startedAt)) {
      if (activeJobs.size > 0) {
        setQueueBatchState({
          status: "stopping",
          source,
          startedAt: state.startedAt ?? nowIso(),
          updatedAt: nowIso(),
          message: `Scheduler end time reached. Waiting for ${activeProcessorLabel(activeJobs.size)} to finish.`,
        });
        await Promise.race(activeJobs.values());
        continue;
      }

      setQueueBatchState({
        status: "idle",
        source,
        startedAt: null,
        updatedAt: nowIso(),
        message: processed > 0 ? `Stopped at scheduler end time after ${processed} file(s).` : "Scheduler end time reached.",
      });
      writeAppLog(
        "info",
        "queue",
        "Automatic queue batch stopped at scheduler end time",
        `Source: ${source}. End time ${settings.scheduleEndAt} reached. Processed ${processed} file(s).`,
      );
      return;
    }

    if (source === "scheduler") {
      const timeZone = resolveSchedulerTimeZone(settings.scheduleTimeZone);
      if (!isWithinConfiguredSchedulerWindow(settings)) {
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
      const mediaFileId = getNextQueuedMediaFileId();
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

    const mediaFileId = getNextQueuedMediaFileId();
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
