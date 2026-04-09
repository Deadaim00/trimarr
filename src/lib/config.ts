import type { TrimarrSettings } from "@/lib/types";

export const SERVER_LOCAL_TIMEZONE = "server-local";

export const DEFAULT_SCAN_ROOTS = [
  "/mnt/media/Complete/Movies",
  "/mnt/media/Complete/TV",
];

export const DEFAULT_SETTINGS: TrimarrSettings = {
  scanRoots: DEFAULT_SCAN_ROOTS,
  scanLimit: 10,
  maxConcurrentJobs: 1,
  libraryPathPrefix: "/mnt/media",
  subtitleProcessingEnabled: true,
  keepEnglishSubtitleTracks: true,
  keepForcedEnglishSubtitles: true,
  keepEnglishSdhSubtitles: true,
  audioProcessingEnabled: true,
  keepEnglishAudio: true,
  keepCommentaryAudio: true,
  keepUnknownAudio: true,
  keepDefaultAudio: true,
  scheduleEnabled: false,
  scheduleRunAt: "03:00",
  scheduleEndAt: "07:00",
  scheduleTimeZone: SERVER_LOCAL_TIMEZONE,
  scheduleScanBeforeProcessing: true,
  scheduleScanNewOrChangedOnly: false,
  scheduleProcessUnprocessedOnly: true,
  webhookEnabled: false,
  webhookAutoProcessWhenIdle: false,
  verboseLogging: false,
  logRetentionDays: 30,
  trashEnabled: false,
  trashRetentionDays: 7,
  webhookToken: "",
};
