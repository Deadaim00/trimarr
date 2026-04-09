import { inspectRootFiles, listRootNewOrChangedMediaFiles } from "@/lib/scan";
import { startQueueBatch } from "@/lib/queue-batch";
import {
  getMetaValue,
  getSettings,
  hasRunningPlans,
  listAudioIncompletePathsUnderRoot,
  listKnownPathsUnderRoot,
  pruneLogs,
  recordScanRun,
  setMetaValue,
  upsertFiles,
  writeAppLog,
} from "@/lib/storage";
import { SERVER_LOCAL_TIMEZONE } from "@/lib/config";

type SchedulerTickResult = {
  status: "disabled" | "waiting" | "already_ran" | "busy" | "completed" | "no_work" | "outside_window";
  message: string;
};

function detectedServerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || "UTC";
}

function schedulerTimeZone(): string {
  const configured = getSettings().scheduleTimeZone;
  return configured === SERVER_LOCAL_TIMEZONE ? detectedServerTimeZone() : configured;
}

function localDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: schedulerTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = parts.get("year") ?? "0000";
  const month = parts.get("month") ?? "00";
  const day = parts.get("day") ?? "00";
  const hour = parts.get("hour") ?? "00";
  const minute = parts.get("minute") ?? "00";

  return {
    dateKey: `${year}-${month}-${day}`,
    timeKey: `${hour}:${minute}`,
  };
}

function isWithinSchedulerWindow(nowTime: string, runAt: string, endAt: string): boolean {
  if (runAt === endAt) {
    return true;
  }

  if (runAt < endAt) {
    return nowTime >= runAt && nowTime < endAt;
  }

  return nowTime >= runAt || nowTime < endAt;
}

async function scanScheduledRoots(): Promise<{ files: number; subtitleTracks: number; audioTracks: number }> {
  const settings = getSettings();
  const sinceIso = settings.scheduleScanNewOrChangedOnly ? getMetaValue("lastRootScanCompletedAt") : null;
  let files = 0;
  let subtitleTracks = 0;
  let audioTracks = 0;

  for (const root of settings.scanRoots) {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const knownPaths = new Set(listKnownPathsUnderRoot(root));
    const audioIncompletePaths = new Set(listAudioIncompletePathsUnderRoot(root));
    const scanFiles = settings.scheduleScanNewOrChangedOnly
      ? await listRootNewOrChangedMediaFiles(root, sinceIso, knownPaths, audioIncompletePaths)
      : await listRootNewOrChangedMediaFiles(root, null, new Set<string>());
    const records = await inspectRootFiles(scanFiles);
    upsertFiles(records);

    const mappedSubtitleTracks = records.reduce((total, record) => total + record.subtitleTrackCount, 0);
    const mappedAudioTracks = records.reduce((total, record) => total + record.audioTrackCount, 0);
    files += records.length;
    subtitleTracks += mappedSubtitleTracks;
    audioTracks += mappedAudioTracks;

    recordScanRun({
      mode: "root",
      target: root,
      limit_count: null,
      files_scanned: records.length,
      subtitle_tracks_mapped: mappedSubtitleTracks,
      audio_tracks_mapped: mappedAudioTracks,
      duration_ms: Date.now() - startedMs,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });
  }

  setMetaValue("lastRootScanCompletedAt", new Date().toISOString());

  return { files, subtitleTracks, audioTracks };
}

export async function runSchedulerTick(): Promise<SchedulerTickResult> {
  const settings = getSettings();
  if (!settings.scheduleEnabled) {
    return { status: "disabled", message: "Scheduler is disabled." };
  }

  const now = localDateParts();
  if (now.timeKey < settings.scheduleRunAt) {
    return { status: "waiting", message: `Waiting for ${settings.scheduleRunAt}.` };
  }

  if (!isWithinSchedulerWindow(now.timeKey, settings.scheduleRunAt, settings.scheduleEndAt)) {
    return {
      status: "outside_window",
      message: `Outside the scheduler window (${settings.scheduleRunAt} - ${settings.scheduleEndAt}).`,
    };
  }

  const lastRunDate = getMetaValue("schedulerLastRunDate");
  if (lastRunDate === now.dateKey) {
    return { status: "already_ran", message: "Scheduled work already ran today." };
  }

  if (hasRunningPlans()) {
    writeAppLog("warn", "scheduler", "Scheduled run skipped because processing is already active", null);
    return { status: "busy", message: "Processing is already running." };
  }

  setMetaValue("schedulerLastRunStartedAt", new Date().toISOString());
  writeAppLog(
    "info",
    "scheduler",
    "Scheduled run started",
    `Timezone: ${schedulerTimeZone()}, window: ${settings.scheduleRunAt} - ${settings.scheduleEndAt}`,
  );
  const prunedLogs = pruneLogs(settings.logRetentionDays);
  if (prunedLogs > 0) {
    writeAppLog("info", "scheduler", "Pruned retained logs", `Removed ${prunedLogs} log entries older than ${settings.logRetentionDays} days.`);
  }

  let scannedFiles = 0;
  let scannedSubtitleTracks = 0;
  let scannedAudioTracks = 0;
  if (settings.scheduleScanBeforeProcessing) {
    const scanSummary = await scanScheduledRoots();
    scannedFiles = scanSummary.files;
    scannedSubtitleTracks = scanSummary.subtitleTracks;
    scannedAudioTracks = scanSummary.audioTracks;
    writeAppLog(
      "info",
      "scheduler",
      "Scheduled scan completed",
      `Files: ${scannedFiles}, subtitle tracks: ${scannedSubtitleTracks}, audio tracks: ${scannedAudioTracks}`,
    );
  }

  const started = startQueueBatch("scheduler");
  setMetaValue("schedulerLastRunDate", now.dateKey);
  setMetaValue("schedulerLastRunCompletedAt", new Date().toISOString());

  if (!started) {
    writeAppLog(
      "info",
      "scheduler",
      "Scheduled run completed with no queued files",
      settings.scheduleScanBeforeProcessing
        ? `Scanned ${scannedFiles} files before checking the queue. No new batch was started.`
        : "No new batch was started.",
    );
    return { status: "no_work", message: "Scheduled run finished. No queued files needed processing." };
  }

  writeAppLog(
    "info",
    "scheduler",
    "Scheduled queue batch started",
    settings.scheduleScanBeforeProcessing
      ? `Started scheduled processing after scanning ${scannedFiles} files, ${scannedSubtitleTracks} subtitle tracks, and ${scannedAudioTracks} audio tracks.`
      : "Started scheduled processing without a scan.",
  );

  return {
    status: "completed",
    message: "Scheduled run started queue processing.",
  };
}
