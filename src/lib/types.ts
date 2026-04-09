export type SubtitleDecision = "keep" | "remove";
export type AudioDecision = "keep" | "remove";

export type PolicyResult = "matched" | "no_keep";

export type TrimarrSettings = {
  scanRoots: string[];
  scanLimit: number;
  maxConcurrentJobs: number;
  libraryPathPrefix: string;
  subtitleProcessingEnabled: boolean;
  keepEnglishSubtitleTracks: boolean;
  keepForcedEnglishSubtitles: boolean;
  keepEnglishSdhSubtitles: boolean;
  audioProcessingEnabled: boolean;
  keepEnglishAudio: boolean;
  keepCommentaryAudio: boolean;
  keepUnknownAudio: boolean;
  keepDefaultAudio: boolean;
  scheduleEnabled: boolean;
  scheduleRunAt: string;
  scheduleEndAt: string;
  scheduleTimeZone: string;
  scheduleScanBeforeProcessing: boolean;
  scheduleScanNewOrChangedOnly: boolean;
  scheduleProcessUnprocessedOnly: boolean;
  webhookEnabled: boolean;
  verboseLogging: boolean;
  logRetentionDays: number;
  trashEnabled: boolean;
  trashRetentionDays: number;
  webhookToken: string;
};

export type SubtitleTrack = {
  id: string;
  index: number;
  codec: string;
  language: string;
  title: string;
  forced: boolean;
  hearingImpaired: boolean;
  default: boolean;
  decision: SubtitleDecision;
  reason: string;
};

export type AudioTrack = {
  id: string;
  index: number;
  codec: string;
  language: string;
  title: string;
  default: boolean;
  commentary: boolean;
  channels: number | null;
  decision: AudioDecision;
  reason: string;
};

export type MediaFileRecord = {
  id: string;
  path: string;
  container: string;
  fileSizeBytes: number;
  scannedAt: string;
  result: PolicyResult;
  processedAt: string | null;
  processedWithWarnings: boolean;
  sizeBeforeBytes: number | null;
  sizeAfterBytes: number | null;
  keepCount: number;
  removeCount: number;
  subtitleTrackCount: number;
  subtitleKeepCount: number;
  subtitleRemoveCount: number;
  audioTrackCount: number;
  audioKeepCount: number;
  audioRemoveCount: number;
  removableTrackCount: number;
  tracks: SubtitleTrack[];
  audioTracks: AudioTrack[];
};

export type DashboardStats = {
  lastScanAt: string | null;
  filesInspected: number;
  subtitleTracksMapped: number;
  audioTracksMapped: number;
  subtitleTracksRemoved: number;
  audioTracksRemoved: number;
  totalBytes: number;
  currentTotalBytes: number;
  processedPriorBytes: number;
  processedCurrentBytes: number;
  processedFiles: number;
  unprocessedFiles: number;
  plannedFiles: number;
};

export type StatisticsOverview = {
  overview: DashboardStats;
  queue: {
    queued: number;
    running: number;
    failed: number;
    idle: number;
    done: number;
  };
  processing: {
    successCount: number;
    warningCount: number;
    trashCount: number;
    totalSavedBytes: number;
    averageSavedBytes: number;
    largestSavedBytes: number;
  };
  scanPerformance: {
    totalRuns: number;
    averageDurationMs: number;
    averageFilesPerRun: number;
    averageSubtitleTracksPerRun: number;
    averageAudioTracksPerRun: number;
    totalFilesScanned: number;
  };
  categoryBreakdown: Array<{
    category: "movie" | "tv";
    files: number;
    processedFiles: number;
    unprocessedFiles: number;
    subtitleTracks: number;
    audioTracks: number;
    subtitleTracksRemoved: number;
    audioTracksRemoved: number;
    processedPriorBytes: number;
    processedCurrentBytes: number;
  }>;
  topSavings: Array<{
    mediaFileId: string;
    path: string;
    processedAt: string;
    savedBytes: number;
    sizeBeforeBytes: number;
    sizeAfterBytes: number;
    processedWithWarnings: boolean;
  }>;
  recentFailures: Array<{
    mediaFileId: string;
    path: string;
    createdAt: string;
    message: string;
  }>;
};

export type ScanRun = {
  id: string;
  mode: "file" | "root";
  target: string;
  limit: number | null;
  filesScanned: number;
  subtitleTracksMapped: number;
  audioTracksMapped: number;
  durationMs: number;
  startedAt: string;
  completedAt: string;
};

export type FilePlan = {
  mediaFileId: string;
  path: string;
  result: PolicyResult;
  keepCount: number;
  removeCount: number;
  subtitleTrackCount: number;
  subtitleKeepCount: number;
  subtitleRemoveCount: number;
  audioTrackCount: number;
  audioKeepCount: number;
  audioRemoveCount: number;
  removableTrackCount: number;
  processedAt: string | null;
  processedWithWarnings: boolean;
  plannedAt: string;
  lastScannedAt: string;
  processingState: "queued" | "running" | "done" | "failed" | "idle";
  progressPercent: number | null;
  processingMessage: string | null;
  processingUpdatedAt: string | null;
};

export type AppLogLevel = "info" | "warn" | "error" | "debug";
export type AppLogSource = "scan" | "process" | "settings" | "queue" | "scheduler" | "system" | "webhook";

export type AppLogEntry = {
  id: string;
  level: AppLogLevel;
  source: AppLogSource;
  message: string;
  details: string | null;
  createdAt: string;
};

export type LogFilters = {
  query?: string;
  level?: AppLogLevel | "all";
  source?: AppLogSource | "all";
};

export type FileHistoryEntry = {
  id: string;
  mediaFileId: string;
  eventType: "queued" | "started" | "validated" | "completed" | "failed" | "reverted" | "trashed";
  message: string;
  details: string | null;
  sizeBeforeBytes: number | null;
  sizeAfterBytes: number | null;
  createdAt: string;
};

export type ProcessedFileRecord = {
  mediaFileId: string;
  path: string;
  processedAt: string;
  processedWithWarnings: boolean;
  sizeBeforeBytes: number | null;
  sizeAfterBytes: number | null;
  lastResult: PolicyResult;
  subtitleTrackCount: number;
  audioTrackCount: number;
  keepCount: number;
  removeCount: number;
  trashAvailable: boolean;
};

export type TrashItem = {
  id: string;
  mediaFileId: string;
  originalPath: string;
  trashPath: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string | null;
  restoredAt: string | null;
  deletedAt: string | null;
};

export type FileFilters = {
  query?: string;
  result?: PolicyResult | "all";
  category?: "all" | "movie" | "tv";
  subtitleState?: "all" | "with_subtitles" | "without_subtitles";
  audioState?: "all" | "extra_audio" | "single_audio";
  processedState?: "all" | "processed" | "unprocessed";
  sort?: "name" | "tracks";
};

export type QueueFilters = {
  query?: string;
  result?: PolicyResult | "all";
  category?: "all" | "movie" | "tv";
  status?: "all" | FilePlan["processingState"];
};

export type HistoryFilters = {
  query?: string;
  category?: "all" | "movie" | "tv";
  outcome?: "all" | "success" | "warnings";
  trashState?: "all" | "with_trash" | "without_trash";
};

export type ActiveScanState = {
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  mode: "file" | "root";
  target: string;
  totalFiles: number;
  scannedFiles: number;
  subtitleTracksMapped: number;
  audioTracksMapped: number;
  startedAt: string;
  completedAt: string | null;
  message: string;
  cancelRequested: boolean;
};

export type QueueBatchState = {
  status: "idle" | "running" | "stopping";
  source: "manual" | "scheduler";
  startedAt: string | null;
  updatedAt: string;
  message: string;
};
