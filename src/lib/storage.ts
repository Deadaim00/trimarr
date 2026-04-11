import type BetterSqlite3 from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { DEFAULT_SETTINGS } from "@/lib/config";
import { createHash } from "node:crypto";
import type {
  AudioTrack,
  AppLogEntry,
  AppLogLevel,
  AppLogSource,
  DashboardStats,
  FileFilters,
  FileHistoryEntry,
  FilePlan,
  HistoryFilters,
  LogFilters,
  MediaFileRecord,
  PolicyResult,
  ProcessedFileRecord,
  QueueFilters,
  QueueBatchState,
  ScanRun,
  SubtitleTrack,
  TrashItem,
  TrimarrSettings,
  ActiveScanState,
  StatisticsOverview,
} from "@/lib/types";

const Database = require("better-sqlite3") as typeof BetterSqlite3;

const dbPath = process.env.TRIMARR_DB_PATH ?? "/data/trimarr.sqlite";

let dbInstance: BetterSqlite3.Database | null = null;

type SettingRow = {
  key: string;
  value: string;
};

type FileRow = {
  id: string;
  path: string;
  container: string;
  file_size_bytes: number;
  scanned_at: string;
  result: PolicyResult;
  processed_at: string | null;
  processed_with_warnings: number;
  processed_subtitle_removed_count: number;
  processed_audio_removed_count: number;
  size_before_bytes: number | null;
  size_after_bytes: number | null;
  keep_count: number;
  remove_count: number;
  review_count: number;
  subtitle_track_count: number;
  subtitle_keep_count: number;
  subtitle_remove_count: number;
  audio_track_count: number;
  audio_keep_count: number;
  audio_remove_count: number;
  removable_track_count: number;
};

type TrackRow = {
  id: string;
  media_file_id: string;
  track_index: number;
  codec: string;
  language: string;
  title: string;
  forced: number;
  hearing_impaired: number;
  default_track: number;
  decision: "keep" | "remove" | "review";
  reason: string;
};

type AudioTrackRow = {
  id: string;
  media_file_id: string;
  track_index: number;
  codec: string;
  language: string;
  title: string;
  default_track: number;
  commentary: number;
  channels: number | null;
  decision: "keep" | "remove";
  reason: string;
};

type ScanRunRow = {
  id: string;
  mode: "file" | "root";
  target: string;
  limit_count: number | null;
  files_scanned: number;
  subtitle_tracks_mapped: number;
  audio_tracks_mapped: number;
  duration_ms: number;
  started_at: string;
  completed_at: string;
};

type FilePlanRow = {
  media_file_id: string;
  path: string;
  result: PolicyResult;
  keep_count: number;
  remove_count: number;
  review_count: number;
  subtitle_track_count: number;
  subtitle_keep_count: number;
  subtitle_remove_count: number;
  audio_track_count: number;
  audio_keep_count: number;
  audio_remove_count: number;
  removable_track_count: number;
  processed_at: string | null;
  processed_with_warnings: number;
  planned_at: string;
  last_scanned_at: string;
  processing_state: "queued" | "running" | "done" | "failed" | "idle";
  progress_percent: number | null;
  processing_message: string | null;
  processing_updated_at: string | null;
};

type ScanRunInput = Omit<ScanRunRow, "id"> & { id?: string };

type AppLogRow = {
  id: string;
  level: AppLogLevel;
  source: AppLogSource;
  message: string;
  details: string | null;
  created_at: string;
};

type FileHistoryRow = {
  id: string;
  media_file_id: string;
  event_type: "queued" | "started" | "validated" | "completed" | "failed";
  message: string;
  details: string | null;
  size_before_bytes: number | null;
  size_after_bytes: number | null;
  created_at: string;
};

type TrashRow = {
  id: string;
  media_file_id: string;
  original_path: string;
  trash_path: string;
  size_bytes: number;
  created_at: string;
  expires_at: string | null;
  restored_at: string | null;
  deleted_at: string | null;
};

function getDb(): BetterSqlite3.Database {
  if (dbInstance) {
    return dbInstance;
  }

  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_files (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      container TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      scanned_at TEXT NOT NULL,
      result TEXT NOT NULL,
      processed_at TEXT,
      processed_with_warnings INTEGER NOT NULL DEFAULT 0,
      processed_subtitle_removed_count INTEGER NOT NULL DEFAULT 0,
      processed_audio_removed_count INTEGER NOT NULL DEFAULT 0,
      size_before_bytes INTEGER,
      size_after_bytes INTEGER,
      keep_count INTEGER NOT NULL,
      remove_count INTEGER NOT NULL,
      review_count INTEGER NOT NULL,
      subtitle_track_count INTEGER NOT NULL,
      subtitle_keep_count INTEGER NOT NULL DEFAULT 0,
      subtitle_remove_count INTEGER NOT NULL DEFAULT 0,
      audio_track_count INTEGER NOT NULL DEFAULT 0,
      audio_keep_count INTEGER NOT NULL DEFAULT 0,
      audio_remove_count INTEGER NOT NULL DEFAULT 0,
      removable_track_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS subtitle_tracks (
      id TEXT PRIMARY KEY,
      media_file_id TEXT NOT NULL,
      track_index INTEGER NOT NULL,
      codec TEXT NOT NULL,
      language TEXT NOT NULL,
      title TEXT NOT NULL,
      forced INTEGER NOT NULL,
      hearing_impaired INTEGER NOT NULL,
      default_track INTEGER NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT NOT NULL,
      FOREIGN KEY (media_file_id) REFERENCES media_files(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audio_tracks (
      id TEXT PRIMARY KEY,
      media_file_id TEXT NOT NULL,
      track_index INTEGER NOT NULL,
      codec TEXT NOT NULL,
      language TEXT NOT NULL,
      title TEXT NOT NULL,
      default_track INTEGER NOT NULL,
      commentary INTEGER NOT NULL,
      channels INTEGER,
      decision TEXT NOT NULL,
      reason TEXT NOT NULL,
      FOREIGN KEY (media_file_id) REFERENCES media_files(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scan_runs (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      target TEXT NOT NULL,
      limit_count INTEGER,
      files_scanned INTEGER NOT NULL,
      subtitle_tracks_mapped INTEGER NOT NULL,
      audio_tracks_mapped INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_plans (
      media_file_id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      result TEXT NOT NULL,
      keep_count INTEGER NOT NULL,
      remove_count INTEGER NOT NULL,
      review_count INTEGER NOT NULL,
      subtitle_track_count INTEGER NOT NULL,
      subtitle_keep_count INTEGER NOT NULL DEFAULT 0,
      subtitle_remove_count INTEGER NOT NULL DEFAULT 0,
      audio_track_count INTEGER NOT NULL DEFAULT 0,
      audio_keep_count INTEGER NOT NULL DEFAULT 0,
      audio_remove_count INTEGER NOT NULL DEFAULT 0,
      removable_track_count INTEGER NOT NULL DEFAULT 0,
      processed_at TEXT,
      processed_with_warnings INTEGER NOT NULL DEFAULT 0,
      planned_at TEXT NOT NULL,
      last_scanned_at TEXT NOT NULL,
      processing_state TEXT NOT NULL DEFAULT 'idle',
      progress_percent INTEGER,
      processing_message TEXT,
      processing_updated_at TEXT,
      FOREIGN KEY (media_file_id) REFERENCES media_files(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_history (
      id TEXT PRIMARY KEY,
      media_file_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      size_before_bytes INTEGER,
      size_after_bytes INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (media_file_id) REFERENCES media_files(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trash_files (
      id TEXT PRIMARY KEY,
      media_file_id TEXT NOT NULL,
      original_path TEXT NOT NULL,
      trash_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      restored_at TEXT,
      deleted_at TEXT,
      FOREIGN KEY (media_file_id) REFERENCES media_files(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_media_files_scanned_at ON media_files(scanned_at DESC);
    CREATE INDEX IF NOT EXISTS idx_media_files_result ON media_files(result);
    CREATE INDEX IF NOT EXISTS idx_subtitle_tracks_media_file_id ON subtitle_tracks(media_file_id);
    CREATE INDEX IF NOT EXISTS idx_audio_tracks_media_file_id ON audio_tracks(media_file_id);
    CREATE INDEX IF NOT EXISTS idx_scan_runs_completed_at ON scan_runs(completed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_file_plans_planned_at ON file_plans(planned_at DESC);
    CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON app_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_file_history_media_file_id ON file_history(media_file_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_trash_files_media_file_id ON trash_files(media_file_id, created_at DESC);
  `);

  const columns = db.prepare("PRAGMA table_info(media_files)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("processed_at")) {
    db.exec("ALTER TABLE media_files ADD COLUMN processed_at TEXT");
  }
  if (!names.has("processed_with_warnings")) {
    db.exec("ALTER TABLE media_files ADD COLUMN processed_with_warnings INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("processed_subtitle_removed_count")) {
    db.exec("ALTER TABLE media_files ADD COLUMN processed_subtitle_removed_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("processed_audio_removed_count")) {
    db.exec("ALTER TABLE media_files ADD COLUMN processed_audio_removed_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("size_before_bytes")) {
    db.exec("ALTER TABLE media_files ADD COLUMN size_before_bytes INTEGER");
  }
  if (!names.has("size_after_bytes")) {
    db.exec("ALTER TABLE media_files ADD COLUMN size_after_bytes INTEGER");
  }
  if (!names.has("subtitle_keep_count")) {
    db.exec("ALTER TABLE media_files ADD COLUMN subtitle_keep_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("subtitle_remove_count")) {
    db.exec("ALTER TABLE media_files ADD COLUMN subtitle_remove_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("audio_track_count")) {
    db.exec("ALTER TABLE media_files ADD COLUMN audio_track_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("audio_keep_count")) {
    db.exec("ALTER TABLE media_files ADD COLUMN audio_keep_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("audio_remove_count")) {
    db.exec("ALTER TABLE media_files ADD COLUMN audio_remove_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("removable_track_count")) {
    db.exec("ALTER TABLE media_files ADD COLUMN removable_track_count INTEGER NOT NULL DEFAULT 0");
  }

  const planColumns = db.prepare("PRAGMA table_info(file_plans)").all() as Array<{ name: string }>;
  const planNames = new Set(planColumns.map((column) => column.name));
  if (!planNames.has("processing_state")) {
    db.exec("ALTER TABLE file_plans ADD COLUMN processing_state TEXT NOT NULL DEFAULT 'idle'");
  }
  if (!planNames.has("processed_with_warnings")) {
    db.exec("ALTER TABLE file_plans ADD COLUMN processed_with_warnings INTEGER NOT NULL DEFAULT 0");
  }
  if (!planNames.has("progress_percent")) {
    db.exec("ALTER TABLE file_plans ADD COLUMN progress_percent INTEGER");
  }
  if (!planNames.has("processing_message")) {
    db.exec("ALTER TABLE file_plans ADD COLUMN processing_message TEXT");
  }
  if (!planNames.has("processing_updated_at")) {
    db.exec("ALTER TABLE file_plans ADD COLUMN processing_updated_at TEXT");
  }
  if (!planNames.has("subtitle_keep_count")) {
    db.exec("ALTER TABLE file_plans ADD COLUMN subtitle_keep_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!planNames.has("subtitle_remove_count")) {
    db.exec("ALTER TABLE file_plans ADD COLUMN subtitle_remove_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!planNames.has("audio_track_count")) {
    db.exec("ALTER TABLE file_plans ADD COLUMN audio_track_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!planNames.has("audio_keep_count")) {
    db.exec("ALTER TABLE file_plans ADD COLUMN audio_keep_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!planNames.has("audio_remove_count")) {
    db.exec("ALTER TABLE file_plans ADD COLUMN audio_remove_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!planNames.has("removable_track_count")) {
    db.exec("ALTER TABLE file_plans ADD COLUMN removable_track_count INTEGER NOT NULL DEFAULT 0");
  }

  const scanColumns = db.prepare("PRAGMA table_info(scan_runs)").all() as Array<{ name: string }>;
  const scanNames = new Set(scanColumns.map((column) => column.name));
  if (!scanNames.has("audio_tracks_mapped")) {
    db.exec("ALTER TABLE scan_runs ADD COLUMN audio_tracks_mapped INTEGER NOT NULL DEFAULT 0");
  }

  seedDefaultSettings(db);
  clearLegacyReviewState(db);
  backfillProcessedWarnings(db);
  dbInstance = db;
  return db;
}

function seedDefaultSettings(db: BetterSqlite3.Database): void {
  const insert = db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)");
  insert.run("scanRoots", JSON.stringify(DEFAULT_SETTINGS.scanRoots));
  insert.run("scanLimit", String(DEFAULT_SETTINGS.scanLimit));
  insert.run("maxConcurrentJobs", String(DEFAULT_SETTINGS.maxConcurrentJobs));
  insert.run("libraryPathPrefix", DEFAULT_SETTINGS.libraryPathPrefix);
  insert.run("subtitleProcessingEnabled", DEFAULT_SETTINGS.subtitleProcessingEnabled ? "1" : "0");
  insert.run("keepEnglishSubtitleTracks", DEFAULT_SETTINGS.keepEnglishSubtitleTracks ? "1" : "0");
  insert.run("keepForcedEnglishSubtitles", DEFAULT_SETTINGS.keepForcedEnglishSubtitles ? "1" : "0");
  insert.run("keepEnglishSdhSubtitles", DEFAULT_SETTINGS.keepEnglishSdhSubtitles ? "1" : "0");
  insert.run("audioProcessingEnabled", DEFAULT_SETTINGS.audioProcessingEnabled ? "1" : "0");
  insert.run("keepEnglishAudio", DEFAULT_SETTINGS.keepEnglishAudio ? "1" : "0");
  insert.run("keepCommentaryAudio", DEFAULT_SETTINGS.keepCommentaryAudio ? "1" : "0");
  insert.run("keepUnknownAudio", DEFAULT_SETTINGS.keepUnknownAudio ? "1" : "0");
  insert.run("keepDefaultAudio", DEFAULT_SETTINGS.keepDefaultAudio ? "1" : "0");
  insert.run("scheduleEnabled", DEFAULT_SETTINGS.scheduleEnabled ? "1" : "0");
  insert.run("scheduleRunAt", DEFAULT_SETTINGS.scheduleRunAt);
  insert.run("scheduleEndAt", DEFAULT_SETTINGS.scheduleEndAt);
  insert.run("scheduleTimeZone", DEFAULT_SETTINGS.scheduleTimeZone);
  insert.run("scheduleScanBeforeProcessing", DEFAULT_SETTINGS.scheduleScanBeforeProcessing ? "1" : "0");
  insert.run("scheduleScanNewOrChangedOnly", DEFAULT_SETTINGS.scheduleScanNewOrChangedOnly ? "1" : "0");
  insert.run("scheduleProcessUnprocessedOnly", DEFAULT_SETTINGS.scheduleProcessUnprocessedOnly ? "1" : "0");
  insert.run("webhookEnabled", DEFAULT_SETTINGS.webhookEnabled ? "1" : "0");
  insert.run("webhookAutoProcessWhenIdle", DEFAULT_SETTINGS.webhookAutoProcessWhenIdle ? "1" : "0");
  insert.run("verboseLogging", DEFAULT_SETTINGS.verboseLogging ? "1" : "0");
  insert.run("logRetentionDays", String(DEFAULT_SETTINGS.logRetentionDays));
  insert.run("trashEnabled", DEFAULT_SETTINGS.trashEnabled ? "1" : "0");
  insert.run("trashRetentionDays", String(DEFAULT_SETTINGS.trashRetentionDays));
  insert.run("webhookToken", DEFAULT_SETTINGS.webhookToken);
}

function readSettingRows(): SettingRow[] {
  return getDb().prepare("SELECT key, value FROM app_settings").all() as SettingRow[];
}

function rowToTrack(row: TrackRow): SubtitleTrack {
  return {
    id: row.id,
    index: row.track_index,
    codec: row.codec,
    language: row.language,
    title: row.title,
    forced: Boolean(row.forced),
    hearingImpaired: Boolean(row.hearing_impaired),
    default: Boolean(row.default_track),
    decision: row.decision === "review" ? "remove" : row.decision,
    reason: row.reason,
  };
}

function rowToAudioTrack(row: AudioTrackRow): AudioTrack {
  return {
    id: row.id,
    index: row.track_index,
    codec: row.codec,
    language: row.language,
    title: row.title,
    default: Boolean(row.default_track),
    commentary: Boolean(row.commentary),
    channels: row.channels,
    decision: row.decision,
    reason: row.reason,
  };
}

function rowToFile(row: FileRow, tracks: SubtitleTrack[], audioTracks: AudioTrack[]): MediaFileRecord {
  return {
    id: row.id,
    path: row.path,
    container: row.container,
    fileSizeBytes: row.file_size_bytes,
    scannedAt: row.scanned_at,
    result: row.result,
    processedAt: row.processed_at,
    processedWithWarnings: Boolean(row.processed_with_warnings),
    sizeBeforeBytes: row.size_before_bytes,
    sizeAfterBytes: row.size_after_bytes,
    processedSubtitleRemovedCount: row.processed_subtitle_removed_count,
    processedAudioRemovedCount: row.processed_audio_removed_count,
    keepCount: row.keep_count,
    removeCount: row.remove_count,
    subtitleTrackCount: row.subtitle_track_count,
    subtitleKeepCount: row.subtitle_keep_count,
    subtitleRemoveCount: row.subtitle_remove_count,
    audioTrackCount: row.audio_track_count,
    audioKeepCount: row.audio_keep_count,
    audioRemoveCount: row.audio_remove_count,
    removableTrackCount: row.removable_track_count,
    tracks,
    audioTracks,
  };
}

function rowToScanRun(row: ScanRunRow): ScanRun {
  return {
    id: row.id,
    mode: row.mode,
    target: row.target,
    limit: row.limit_count,
    filesScanned: row.files_scanned,
    subtitleTracksMapped: row.subtitle_tracks_mapped,
    audioTracksMapped: row.audio_tracks_mapped,
    durationMs: row.duration_ms,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function rowToFilePlan(row: FilePlanRow): FilePlan {
  return {
    mediaFileId: row.media_file_id,
    path: row.path,
    result: row.result,
    keepCount: row.keep_count,
    removeCount: row.remove_count,
    subtitleTrackCount: row.subtitle_track_count,
    subtitleKeepCount: row.subtitle_keep_count,
    subtitleRemoveCount: row.subtitle_remove_count,
    audioTrackCount: row.audio_track_count,
    audioKeepCount: row.audio_keep_count,
    audioRemoveCount: row.audio_remove_count,
    removableTrackCount: row.removable_track_count,
    processedAt: row.processed_at,
    processedWithWarnings: Boolean(row.processed_with_warnings),
    plannedAt: row.planned_at,
    lastScannedAt: row.last_scanned_at,
    processingState: row.processing_state,
    progressPercent: row.progress_percent,
    processingMessage: row.processing_message,
    processingUpdatedAt: row.processing_updated_at,
  };
}

function rowToAppLog(row: AppLogRow): AppLogEntry {
  return {
    id: row.id,
    level: row.level,
    source: row.source,
    message: row.message,
    details: row.details,
    createdAt: row.created_at,
  };
}

function rowToFileHistory(row: FileHistoryRow): FileHistoryEntry {
  return {
    id: row.id,
    mediaFileId: row.media_file_id,
    eventType: row.event_type,
    message: row.message,
    details: row.details,
    sizeBeforeBytes: row.size_before_bytes,
    sizeAfterBytes: row.size_after_bytes,
    createdAt: row.created_at,
  };
}

function rowToTrashItem(row: TrashRow): TrashItem {
  return {
    id: row.id,
    mediaFileId: row.media_file_id,
    originalPath: row.original_path,
    trashPath: row.trash_path,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    restoredAt: row.restored_at,
    deletedAt: row.deleted_at,
  };
}

function scanRunIdFor(input: ScanRunInput): string {
  return (
    input.id ??
    createHash("sha1")
      .update([input.mode, input.target, input.started_at, input.completed_at, input.files_scanned].join(":"))
      .digest("hex")
  );
}

function clearLegacyReviewState(db: BetterSqlite3.Database): void {
  db.prepare("UPDATE subtitle_tracks SET decision = 'remove' WHERE decision = 'review'").run();
  db.prepare("UPDATE media_files SET result = 'no_keep', review_count = 0 WHERE result = 'review'").run();
  db.prepare("UPDATE media_files SET review_count = 0 WHERE review_count != 0").run();
  db.prepare("UPDATE file_plans SET result = 'no_keep', review_count = 0 WHERE result = 'review'").run();
  db.prepare("UPDATE file_plans SET review_count = 0 WHERE review_count != 0").run();
}

function backfillProcessedWarnings(db: BetterSqlite3.Database): void {
  db.exec(`
    UPDATE media_files
    SET processed_with_warnings = 1
    WHERE processed_at IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM file_history fh
        WHERE fh.media_file_id = media_files.id
          AND fh.message = 'Remux completed with source file warnings'
      );

    UPDATE file_plans
    SET processed_with_warnings = 1,
        processing_message = CASE
          WHEN processing_state = 'done' THEN 'Completed with warnings.'
          ELSE processing_message
        END
    WHERE processed_at IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM file_history fh
        WHERE fh.media_file_id = file_plans.media_file_id
          AND fh.message = 'Remux completed with source file warnings'
      );
  `);
}

export function getSettings(): TrimarrSettings {
  const map = new Map(readSettingRows().map((row) => [row.key, row.value]));
  const scanLimit = map.get("scanLimit") ?? map.get("sampleScanLimit");

  return {
    scanRoots: JSON.parse(map.get("scanRoots") ?? JSON.stringify(DEFAULT_SETTINGS.scanRoots)) as string[],
    scanLimit: Number(scanLimit ?? DEFAULT_SETTINGS.scanLimit),
    maxConcurrentJobs: Math.min(4, Math.max(1, Number(map.get("maxConcurrentJobs") ?? DEFAULT_SETTINGS.maxConcurrentJobs))),
    libraryPathPrefix: map.get("libraryPathPrefix") ?? DEFAULT_SETTINGS.libraryPathPrefix,
    subtitleProcessingEnabled: map.get("subtitleProcessingEnabled") !== "0",
    keepEnglishSubtitleTracks: map.get("keepEnglishSubtitleTracks") !== "0",
    keepForcedEnglishSubtitles: map.get("keepForcedEnglishSubtitles") !== "0" || map.get("keepEnglishForced") !== "0",
    keepEnglishSdhSubtitles: map.get("keepEnglishSdhSubtitles") !== "0" || map.get("keepEnglishSdh") !== "0",
    audioProcessingEnabled: map.get("audioProcessingEnabled") !== "0",
    keepEnglishAudio: map.get("keepEnglishAudio") !== "0",
    keepCommentaryAudio: map.get("keepCommentaryAudio") !== "0",
    keepUnknownAudio: map.get("keepUnknownAudio") !== "0",
    keepDefaultAudio: map.get("keepDefaultAudio") !== "0",
    scheduleEnabled: map.get("scheduleEnabled") === "1",
    scheduleRunAt: map.get("scheduleRunAt") ?? DEFAULT_SETTINGS.scheduleRunAt,
    scheduleEndAt: map.get("scheduleEndAt") ?? DEFAULT_SETTINGS.scheduleEndAt,
    scheduleTimeZone: map.get("scheduleTimeZone") ?? DEFAULT_SETTINGS.scheduleTimeZone,
    scheduleScanBeforeProcessing: map.get("scheduleScanBeforeProcessing") !== "0",
    scheduleScanNewOrChangedOnly: map.get("scheduleScanNewOrChangedOnly") !== "0",
    scheduleProcessUnprocessedOnly: map.get("scheduleProcessUnprocessedOnly") !== "0",
    webhookEnabled: map.get("webhookEnabled") === "1",
    webhookAutoProcessWhenIdle: map.get("webhookAutoProcessWhenIdle") === "1",
    verboseLogging: map.get("verboseLogging") === "1",
    logRetentionDays: Number(map.get("logRetentionDays") ?? DEFAULT_SETTINGS.logRetentionDays),
    trashEnabled: map.get("trashEnabled") === "1",
    trashRetentionDays: Number(map.get("trashRetentionDays") ?? DEFAULT_SETTINGS.trashRetentionDays),
    webhookToken: map.get("webhookToken") ?? DEFAULT_SETTINGS.webhookToken,
  };
}

export function saveSettings(settings: TrimarrSettings): TrimarrSettings {
  const db = getDb();
  const insert = db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)");
  const transaction = db.transaction((next: TrimarrSettings) => {
    insert.run("scanRoots", JSON.stringify(next.scanRoots));
    insert.run("scanLimit", String(next.scanLimit));
    insert.run("maxConcurrentJobs", String(next.maxConcurrentJobs));
    db.prepare("DELETE FROM app_settings WHERE key = ?").run("sampleScanLimit");
    insert.run("libraryPathPrefix", next.libraryPathPrefix);
    insert.run("subtitleProcessingEnabled", next.subtitleProcessingEnabled ? "1" : "0");
    insert.run("keepEnglishSubtitleTracks", next.keepEnglishSubtitleTracks ? "1" : "0");
    insert.run("keepForcedEnglishSubtitles", next.keepForcedEnglishSubtitles ? "1" : "0");
    insert.run("keepEnglishSdhSubtitles", next.keepEnglishSdhSubtitles ? "1" : "0");
    insert.run("audioProcessingEnabled", next.audioProcessingEnabled ? "1" : "0");
    insert.run("keepEnglishAudio", next.keepEnglishAudio ? "1" : "0");
    insert.run("keepCommentaryAudio", next.keepCommentaryAudio ? "1" : "0");
    insert.run("keepUnknownAudio", next.keepUnknownAudio ? "1" : "0");
    insert.run("keepDefaultAudio", next.keepDefaultAudio ? "1" : "0");
    insert.run("scheduleEnabled", next.scheduleEnabled ? "1" : "0");
    insert.run("scheduleRunAt", next.scheduleRunAt);
    insert.run("scheduleEndAt", next.scheduleEndAt);
    insert.run("scheduleTimeZone", next.scheduleTimeZone);
    insert.run("scheduleScanBeforeProcessing", next.scheduleScanBeforeProcessing ? "1" : "0");
    insert.run("scheduleScanNewOrChangedOnly", next.scheduleScanNewOrChangedOnly ? "1" : "0");
    insert.run("scheduleProcessUnprocessedOnly", next.scheduleProcessUnprocessedOnly ? "1" : "0");
    insert.run("webhookEnabled", next.webhookEnabled ? "1" : "0");
    insert.run("webhookAutoProcessWhenIdle", next.webhookAutoProcessWhenIdle ? "1" : "0");
    insert.run("verboseLogging", next.verboseLogging ? "1" : "0");
    insert.run("logRetentionDays", String(next.logRetentionDays));
    insert.run("trashEnabled", next.trashEnabled ? "1" : "0");
    insert.run("trashRetentionDays", String(next.trashRetentionDays));
    insert.run("webhookToken", next.webhookToken);
  });

  transaction(settings);
  return getSettings();
}

export function clearInventory(): void {
  const db = getDb();
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM app_logs").run();
    db.prepare("DELETE FROM file_history").run();
    db.prepare("DELETE FROM trash_files").run();
    db.prepare("DELETE FROM audio_tracks").run();
    db.prepare("DELETE FROM subtitle_tracks").run();
    db.prepare("DELETE FROM file_plans").run();
    db.prepare("DELETE FROM scan_runs").run();
    db.prepare("DELETE FROM media_files").run();
    db.prepare("DELETE FROM app_meta WHERE key = ?").run("lastScanAt");
  });

  transaction();
}

export function upsertFiles(files: MediaFileRecord[]): void {
  const db = getDb();
  const insertFile = db.prepare(`
    INSERT INTO media_files (
      id, path, container, file_size_bytes, scanned_at, result, processed_at, processed_with_warnings, size_before_bytes, size_after_bytes,
        processed_subtitle_removed_count, processed_audio_removed_count,
        keep_count, remove_count, review_count, subtitle_track_count,
        subtitle_keep_count, subtitle_remove_count, audio_track_count, audio_keep_count, audio_remove_count, removable_track_count
    ) VALUES (
      @id, @path, @container, @file_size_bytes, @scanned_at, @result, @processed_at, @processed_with_warnings, @size_before_bytes, @size_after_bytes,
      @processed_subtitle_removed_count, @processed_audio_removed_count,
      @keep_count, @remove_count, @review_count, @subtitle_track_count,
      @subtitle_keep_count, @subtitle_remove_count, @audio_track_count, @audio_keep_count, @audio_remove_count, @removable_track_count
    )
    ON CONFLICT(id) DO UPDATE SET
      path = excluded.path,
      container = excluded.container,
      file_size_bytes = excluded.file_size_bytes,
      scanned_at = excluded.scanned_at,
      result = excluded.result,
      processed_at = COALESCE(media_files.processed_at, excluded.processed_at),
      processed_with_warnings = CASE
        WHEN media_files.processed_with_warnings = 1 THEN 1
        ELSE excluded.processed_with_warnings
      END,
      processed_subtitle_removed_count = CASE
        WHEN media_files.processed_at IS NOT NULL THEN media_files.processed_subtitle_removed_count
        ELSE excluded.processed_subtitle_removed_count
      END,
      processed_audio_removed_count = CASE
        WHEN media_files.processed_at IS NOT NULL THEN media_files.processed_audio_removed_count
        ELSE excluded.processed_audio_removed_count
      END,
      size_before_bytes = COALESCE(media_files.size_before_bytes, excluded.size_before_bytes),
      size_after_bytes = COALESCE(media_files.size_after_bytes, excluded.size_after_bytes),
      keep_count = excluded.keep_count,
      remove_count = excluded.remove_count,
      review_count = excluded.review_count,
      subtitle_track_count = excluded.subtitle_track_count,
      subtitle_keep_count = excluded.subtitle_keep_count,
      subtitle_remove_count = excluded.subtitle_remove_count,
      audio_track_count = excluded.audio_track_count,
      audio_keep_count = excluded.audio_keep_count,
      audio_remove_count = excluded.audio_remove_count,
      removable_track_count = excluded.removable_track_count
  `);
  const deleteTracks = db.prepare("DELETE FROM subtitle_tracks WHERE media_file_id = ?");
  const deleteAudioTracks = db.prepare("DELETE FROM audio_tracks WHERE media_file_id = ?");
  const insertTrack = db.prepare(`
    INSERT OR REPLACE INTO subtitle_tracks (
      id, media_file_id, track_index, codec, language, title,
      forced, hearing_impaired, default_track, decision, reason
    ) VALUES (
      @id, @media_file_id, @track_index, @codec, @language, @title,
      @forced, @hearing_impaired, @default_track, @decision, @reason
    )
  `);
  const insertAudioTrack = db.prepare(`
    INSERT OR REPLACE INTO audio_tracks (
      id, media_file_id, track_index, codec, language, title,
      default_track, commentary, channels, decision, reason
    ) VALUES (
      @id, @media_file_id, @track_index, @codec, @language, @title,
      @default_track, @commentary, @channels, @decision, @reason
    )
  `);
  const upsertPlan = db.prepare(`
    INSERT INTO file_plans (
      media_file_id, path, result, keep_count, remove_count, review_count,
      subtitle_track_count, subtitle_keep_count, subtitle_remove_count,
      audio_track_count, audio_keep_count, audio_remove_count, removable_track_count,
      processed_at, processed_with_warnings, planned_at, last_scanned_at,
      processing_state, progress_percent, processing_message, processing_updated_at
    ) VALUES (
      @media_file_id, @path, @result, @keep_count, @remove_count, @review_count,
      @subtitle_track_count, @subtitle_keep_count, @subtitle_remove_count,
      @audio_track_count, @audio_keep_count, @audio_remove_count, @removable_track_count,
      @processed_at, @processed_with_warnings, @planned_at, @last_scanned_at,
      @processing_state, @progress_percent, @processing_message, @processing_updated_at
    )
    ON CONFLICT(media_file_id) DO UPDATE SET
      path = excluded.path,
      result = excluded.result,
      keep_count = excluded.keep_count,
      remove_count = excluded.remove_count,
      review_count = excluded.review_count,
      subtitle_track_count = excluded.subtitle_track_count,
      subtitle_keep_count = excluded.subtitle_keep_count,
      subtitle_remove_count = excluded.subtitle_remove_count,
      audio_track_count = excluded.audio_track_count,
      audio_keep_count = excluded.audio_keep_count,
      audio_remove_count = excluded.audio_remove_count,
      removable_track_count = excluded.removable_track_count,
      processed_at = COALESCE(file_plans.processed_at, excluded.processed_at),
      processed_with_warnings = CASE
        WHEN file_plans.processed_with_warnings = 1 THEN 1
        ELSE excluded.processed_with_warnings
      END,
      planned_at = excluded.planned_at,
      last_scanned_at = excluded.last_scanned_at,
      processing_state = CASE
        WHEN file_plans.processed_at IS NOT NULL THEN 'done'
        WHEN file_plans.processing_state IN ('running', 'failed') THEN file_plans.processing_state
        ELSE excluded.processing_state
      END,
      progress_percent = CASE
        WHEN file_plans.processed_at IS NOT NULL THEN 100
        WHEN file_plans.processing_state IN ('running', 'failed') THEN file_plans.progress_percent
        ELSE excluded.progress_percent
      END,
      processing_message = CASE
        WHEN file_plans.processed_at IS NOT NULL THEN COALESCE(file_plans.processing_message, 'Processing complete.')
        WHEN file_plans.processing_state IN ('running', 'failed') THEN file_plans.processing_message
        ELSE excluded.processing_message
      END,
      processing_updated_at = CASE
        WHEN file_plans.processed_at IS NOT NULL THEN COALESCE(file_plans.processing_updated_at, excluded.processing_updated_at)
        WHEN file_plans.processing_state IN ('running', 'failed') THEN file_plans.processing_updated_at
        ELSE excluded.processing_updated_at
      END
  `);
  const setMeta = db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)");

  const transaction = db.transaction((records: MediaFileRecord[]) => {
    const scannedAt = new Date().toISOString();
    const plannedAt = scannedAt;

    for (const file of records) {
      insertFile.run({
        id: file.id,
        path: file.path,
        container: file.container,
        file_size_bytes: file.fileSizeBytes,
        scanned_at: file.scannedAt,
        result: file.result,
        processed_at: file.processedAt,
        processed_with_warnings: file.processedWithWarnings ? 1 : 0,
        processed_subtitle_removed_count: 0,
        processed_audio_removed_count: 0,
        size_before_bytes: file.sizeBeforeBytes,
        size_after_bytes: file.sizeAfterBytes,
        keep_count: file.keepCount,
        remove_count: file.removeCount,
        review_count: 0,
        subtitle_track_count: file.subtitleTrackCount,
        subtitle_keep_count: file.subtitleKeepCount,
        subtitle_remove_count: file.subtitleRemoveCount,
        audio_track_count: file.audioTrackCount,
        audio_keep_count: file.audioKeepCount,
        audio_remove_count: file.audioRemoveCount,
        removable_track_count: file.removableTrackCount,
      });

      deleteTracks.run(file.id);
      deleteAudioTracks.run(file.id);

      for (const track of file.tracks) {
        insertTrack.run({
          id: track.id,
          media_file_id: file.id,
          track_index: track.index,
          codec: track.codec,
          language: track.language,
          title: track.title,
          forced: track.forced ? 1 : 0,
          hearing_impaired: track.hearingImpaired ? 1 : 0,
          default_track: track.default ? 1 : 0,
          decision: track.decision,
          reason: track.reason,
        });
      }

      for (const track of file.audioTracks) {
        insertAudioTrack.run({
          id: track.id,
          media_file_id: file.id,
          track_index: track.index,
          codec: track.codec,
          language: track.language,
          title: track.title,
          default_track: track.default ? 1 : 0,
          commentary: track.commentary ? 1 : 0,
          channels: track.channels,
          decision: track.decision,
          reason: track.reason,
        });
      }

      upsertPlan.run({
        media_file_id: file.id,
        path: file.path,
        result: file.result,
        keep_count: file.keepCount,
        remove_count: file.removeCount,
        review_count: 0,
        subtitle_track_count: file.subtitleTrackCount,
        subtitle_keep_count: file.subtitleKeepCount,
        subtitle_remove_count: file.subtitleRemoveCount,
        audio_track_count: file.audioTrackCount,
        audio_keep_count: file.audioKeepCount,
        audio_remove_count: file.audioRemoveCount,
        removable_track_count: file.removableTrackCount,
        processed_at: file.processedAt,
        processed_with_warnings: file.processedWithWarnings ? 1 : 0,
        planned_at: plannedAt,
        last_scanned_at: file.scannedAt,
        processing_state: file.processedAt
          ? "done"
          : file.removableTrackCount > 0
            ? "queued"
            : "idle",
        progress_percent: file.processedAt ? 100 : null,
        processing_message: file.processedAt ? (file.processedWithWarnings ? "Completed with warnings." : "Processing complete.") : null,
        processing_updated_at: file.processedAt ?? null,
      });
    }

    setMeta.run("lastScanAt", scannedAt);
  });

  transaction(files);
}

export function getDashboardStats(): DashboardStats {
  const db = getDb();
  const stats = db
    .prepare(`
      SELECT
        COUNT(*) as filesInspected,
        COALESCE(SUM(subtitle_track_count), 0) as subtitleTracksMapped,
        COALESCE(SUM(audio_track_count), 0) as audioTracksMapped,
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL THEN processed_subtitle_removed_count ELSE 0 END), 0) as subtitleTracksRemoved,
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL THEN processed_audio_removed_count ELSE 0 END), 0) as audioTracksRemoved,
        COALESCE(SUM(COALESCE(size_before_bytes, file_size_bytes)), 0) as totalBytes,
        COALESCE(SUM(COALESCE(size_after_bytes, file_size_bytes)), 0) as currentTotalBytes,
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL THEN COALESCE(size_before_bytes, file_size_bytes) ELSE 0 END), 0) as processedPriorBytes,
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL THEN COALESCE(size_after_bytes, file_size_bytes) ELSE 0 END), 0) as processedCurrentBytes,
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL THEN 1 ELSE 0 END), 0) as processedFiles,
        COALESCE(SUM(CASE WHEN processed_at IS NULL THEN 1 ELSE 0 END), 0) as unprocessedFiles
      FROM media_files
    `)
    .get() as DashboardStats;

  const planMeta = db
    .prepare("SELECT COUNT(*) as plannedFiles FROM file_plans")
    .get() as Pick<DashboardStats, "plannedFiles">;

  const meta = db.prepare("SELECT value FROM app_meta WHERE key = ?").get("lastScanAt") as { value?: string } | undefined;

  return {
    lastScanAt: meta?.value ?? null,
    filesInspected: stats.filesInspected,
    subtitleTracksMapped: stats.subtitleTracksMapped,
    audioTracksMapped: stats.audioTracksMapped,
    subtitleTracksRemoved: stats.subtitleTracksRemoved,
    audioTracksRemoved: stats.audioTracksRemoved,
    totalBytes: stats.totalBytes,
    currentTotalBytes: stats.currentTotalBytes,
    processedPriorBytes: stats.processedPriorBytes,
    processedCurrentBytes: stats.processedCurrentBytes,
    processedFiles: stats.processedFiles,
    unprocessedFiles: stats.unprocessedFiles,
    plannedFiles: planMeta.plannedFiles,
  };
}

export function getStatisticsOverview(): StatisticsOverview {
  const db = getDb();
  const overview = getDashboardStats();

  const queue = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN processing_state = 'queued' THEN 1 ELSE 0 END), 0) as queued,
        COALESCE(SUM(CASE WHEN processing_state = 'running' THEN 1 ELSE 0 END), 0) as running,
        COALESCE(SUM(CASE WHEN processing_state = 'failed' THEN 1 ELSE 0 END), 0) as failed,
        COALESCE(SUM(CASE WHEN processing_state = 'idle' THEN 1 ELSE 0 END), 0) as idle,
        COALESCE(SUM(CASE WHEN processing_state = 'done' THEN 1 ELSE 0 END), 0) as done
      FROM file_plans
    `)
    .get() as StatisticsOverview["queue"];

  const processing = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL AND COALESCE(processed_with_warnings, 0) = 0 THEN 1 ELSE 0 END), 0) as successCount,
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL AND processed_with_warnings = 1 THEN 1 ELSE 0 END), 0) as warningCount,
        COALESCE(SUM(CASE WHEN EXISTS (
          SELECT 1 FROM trash_files t
          WHERE t.media_file_id = media_files.id
            AND t.restored_at IS NULL
            AND t.deleted_at IS NULL
        ) THEN 1 ELSE 0 END), 0) as trashCount,
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL THEN COALESCE(size_before_bytes, file_size_bytes) - COALESCE(size_after_bytes, file_size_bytes) ELSE 0 END), 0) as totalSavedBytes,
        COALESCE(AVG(CASE WHEN processed_at IS NOT NULL THEN COALESCE(size_before_bytes, file_size_bytes) - COALESCE(size_after_bytes, file_size_bytes) END), 0) as averageSavedBytes,
        COALESCE(MAX(CASE WHEN processed_at IS NOT NULL THEN COALESCE(size_before_bytes, file_size_bytes) - COALESCE(size_after_bytes, file_size_bytes) END), 0) as largestSavedBytes
      FROM media_files
    `)
    .get() as StatisticsOverview["processing"];

  const scanPerformance = db
    .prepare(`
      SELECT
        COUNT(*) as totalRuns,
        COALESCE(AVG(duration_ms), 0) as averageDurationMs,
        COALESCE(AVG(files_scanned), 0) as averageFilesPerRun,
        COALESCE(AVG(subtitle_tracks_mapped), 0) as averageSubtitleTracksPerRun,
        COALESCE(AVG(audio_tracks_mapped), 0) as averageAudioTracksPerRun,
        COALESCE(SUM(files_scanned), 0) as totalFilesScanned
      FROM scan_runs
    `)
    .get() as StatisticsOverview["scanPerformance"];

  const categoryBreakdown = db
    .prepare(`
      SELECT
        CASE
          WHEN lower(path) LIKE '%/complete/movies/%' THEN 'movie'
          ELSE 'tv'
        END as category,
        COUNT(*) as files,
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL THEN 1 ELSE 0 END), 0) as processedFiles,
        COALESCE(SUM(CASE WHEN processed_at IS NULL THEN 1 ELSE 0 END), 0) as unprocessedFiles,
        COALESCE(SUM(subtitle_track_count), 0) as subtitleTracks,
        COALESCE(SUM(audio_track_count), 0) as audioTracks,
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL THEN processed_subtitle_removed_count ELSE 0 END), 0) as subtitleTracksRemoved,
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL THEN processed_audio_removed_count ELSE 0 END), 0) as audioTracksRemoved,
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL THEN COALESCE(size_before_bytes, file_size_bytes) ELSE 0 END), 0) as processedPriorBytes,
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL THEN COALESCE(size_after_bytes, file_size_bytes) ELSE 0 END), 0) as processedCurrentBytes
      FROM media_files
      GROUP BY category
      ORDER BY category ASC
    `)
    .all() as StatisticsOverview["categoryBreakdown"];

  const topSavings = db
    .prepare(`
      SELECT
        id as mediaFileId,
        path,
        processed_at as processedAt,
        COALESCE(size_before_bytes, file_size_bytes) - COALESCE(size_after_bytes, file_size_bytes) as savedBytes,
        COALESCE(size_before_bytes, file_size_bytes) as sizeBeforeBytes,
        COALESCE(size_after_bytes, file_size_bytes) as sizeAfterBytes,
        processed_with_warnings as processedWithWarnings
      FROM media_files
      WHERE processed_at IS NOT NULL
      ORDER BY savedBytes DESC, processed_at DESC
      LIMIT 10
    `)
    .all() as Array<{
      mediaFileId: string;
      path: string;
      processedAt: string;
      savedBytes: number;
      sizeBeforeBytes: number;
      sizeAfterBytes: number;
      processedWithWarnings: number;
    }>;

  const recentFailures = db
    .prepare(`
      SELECT
        fh.media_file_id as mediaFileId,
        m.path,
        fh.created_at as createdAt,
        fh.message
      FROM file_history fh
      JOIN media_files m ON m.id = fh.media_file_id
      WHERE fh.event_type = 'failed'
      ORDER BY fh.created_at DESC
      LIMIT 10
    `)
    .all() as Array<{
      mediaFileId: string;
      path: string;
      createdAt: string;
      message: string;
    }>;

  return {
    overview,
    queue,
    processing: {
      ...processing,
      averageSavedBytes: Number(processing.averageSavedBytes ?? 0),
      totalSavedBytes: Number(processing.totalSavedBytes ?? 0),
      largestSavedBytes: Number(processing.largestSavedBytes ?? 0),
    },
    scanPerformance: {
      ...scanPerformance,
      averageDurationMs: Number(scanPerformance.averageDurationMs ?? 0),
      averageFilesPerRun: Number(scanPerformance.averageFilesPerRun ?? 0),
      averageSubtitleTracksPerRun: Number(scanPerformance.averageSubtitleTracksPerRun ?? 0),
      averageAudioTracksPerRun: Number(scanPerformance.averageAudioTracksPerRun ?? 0),
      totalFilesScanned: Number(scanPerformance.totalFilesScanned ?? 0),
    },
    categoryBreakdown,
    topSavings: topSavings.map((row) => ({
      mediaFileId: row.mediaFileId,
      path: row.path,
      processedAt: row.processedAt,
      savedBytes: Number(row.savedBytes ?? 0),
      sizeBeforeBytes: Number(row.sizeBeforeBytes ?? 0),
      sizeAfterBytes: Number(row.sizeAfterBytes ?? 0),
      processedWithWarnings: Boolean(row.processedWithWarnings),
    })),
    recentFailures: recentFailures.map((row) => ({
      mediaFileId: row.mediaFileId,
      path: row.path,
      createdAt: row.createdAt,
      message: row.message,
    })),
  };
}

export function markFileProcessed(
  id: string,
  sizeBeforeBytes: number,
  sizeAfterBytes: number,
  subtitleRemovedCount: number,
  audioRemovedCount: number,
): void {
  const db = getDb();
  const processedAt = new Date().toISOString();
  db.prepare(
    `UPDATE media_files
     SET processed_at = ?,
         processed_with_warnings = COALESCE(processed_with_warnings, 0),
         processed_subtitle_removed_count = ?,
         processed_audio_removed_count = ?,
         size_before_bytes = ?,
         size_after_bytes = ?
     WHERE id = ?`,
  ).run(processedAt, subtitleRemovedCount, audioRemovedCount, sizeBeforeBytes, sizeAfterBytes, id);
  db.prepare(`
    UPDATE file_plans
    SET processed_at = ?, processing_state = 'done', progress_percent = 100,
        processing_message = CASE WHEN processed_with_warnings = 1 THEN 'Completed with warnings.' ELSE 'Processing complete.' END,
        processing_updated_at = ?
    WHERE media_file_id = ?
  `).run(processedAt, processedAt, id);
}

export function setFileProcessedWarnings(id: string, hasWarnings: boolean): void {
  getDb()
    .prepare("UPDATE media_files SET processed_with_warnings = ? WHERE id = ?")
    .run(hasWarnings ? 1 : 0, id);

  getDb()
    .prepare("UPDATE file_plans SET processed_with_warnings = ? WHERE media_file_id = ?")
    .run(hasWarnings ? 1 : 0, id);
}

export function resetFileProcessedState(id: string, removableTrackCount: number): void {
  const updatedAt = new Date().toISOString();
  const nextState = removableTrackCount > 0 ? "queued" : "idle";
  const nextMessage = removableTrackCount > 0 ? "Reverted to original file." : "Restored file has nothing to process.";

  getDb()
    .prepare("UPDATE media_files SET processed_at = NULL, processed_with_warnings = 0, processed_subtitle_removed_count = 0, processed_audio_removed_count = 0, size_before_bytes = NULL, size_after_bytes = NULL WHERE id = ?")
    .run(id);

  getDb()
    .prepare(`
      UPDATE file_plans
      SET processed_at = NULL,
          processed_with_warnings = 0,
          processing_state = ?,
          progress_percent = NULL,
          processing_message = ?,
          processing_updated_at = ?
      WHERE media_file_id = ?
    `)
    .run(nextState, nextMessage, updatedAt, id);
}

function categoryCaseSql(): string {
  return `
    CASE
      WHEN path LIKE '%/Complete/TV/%' THEN 'tv'
      WHEN path LIKE '%/Complete/Movies/%' THEN 'movie'
      ELSE 'other'
    END
  `;
}

export function listFiles(filters: FileFilters = {}, limit = 100): MediaFileRecord[] {
  return listFilesPage(filters, limit, 0);
}

function buildFilesWhere(filters: FileFilters = {}): { whereSql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.result && filters.result !== "all") {
    where.push("result = ?");
    params.push(filters.result);
  }

  if (filters.category && filters.category !== "all") {
    where.push(`${categoryCaseSql()} = ?`);
    params.push(filters.category);
  }

  if (filters.subtitleState === "with_subtitles") {
    where.push("(subtitle_track_count > 0 OR audio_track_count > 0)");
  } else if (filters.subtitleState === "without_subtitles") {
    where.push("subtitle_track_count = 0 AND audio_track_count = 0");
  }

  if (filters.audioState === "extra_audio") {
    where.push("audio_track_count > 1");
  } else if (filters.audioState === "single_audio") {
    where.push("audio_track_count <= 1");
  }

  if (filters.processedState === "processed") {
    where.push("processed_at IS NOT NULL");
  } else if (filters.processedState === "unprocessed") {
    where.push("processed_at IS NULL");
  }

  if (filters.query?.trim()) {
    where.push("path LIKE ?");
    params.push(`%${filters.query.trim()}%`);
  }

  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

function buildFilesOrderBy(sort: FileFilters["sort"] = "name"): string {
  if (sort === "tracks") {
    return "ORDER BY removable_track_count DESC, (subtitle_track_count + audio_track_count) DESC, path ASC";
  }

  return "ORDER BY path ASC";
}

export function countFiles(filters: FileFilters = {}): number {
  const db = getDb();
  const { whereSql, params } = buildFilesWhere(filters);
  const row = db.prepare(`SELECT COUNT(*) as count FROM media_files ${whereSql}`).get(...params) as { count: number };
  return row.count;
}

export function listFilesPage(filters: FileFilters = {}, limit = 100, offset = 0): MediaFileRecord[] {
  const db = getDb();
  const { whereSql, params } = buildFilesWhere(filters);
  const orderBySql = buildFilesOrderBy(filters.sort);
  const sql = `
    SELECT *
    FROM media_files
    ${whereSql}
    ${orderBySql}
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(sql).all(...params, limit, offset) as FileRow[];
  const trackStmt = db.prepare("SELECT * FROM subtitle_tracks WHERE media_file_id = ? ORDER BY track_index ASC");
  const audioTrackStmt = db.prepare("SELECT * FROM audio_tracks WHERE media_file_id = ? ORDER BY track_index ASC");

  return rows.map((row) => {
    const tracks = (trackStmt.all(row.id) as TrackRow[]).map(rowToTrack);
    const audioTracks = (audioTrackStmt.all(row.id) as AudioTrackRow[]).map(rowToAudioTrack);
    return rowToFile(row, tracks, audioTracks);
  });
}

export function getRecentFiles(limit = 12): MediaFileRecord[] {
  return listFiles({}, limit);
}

export function recordScanRun(input: ScanRunInput): ScanRun {
  const db = getDb();
  const row: ScanRunRow = {
    id: scanRunIdFor(input),
    mode: input.mode,
    target: input.target,
    limit_count: input.limit_count,
    files_scanned: input.files_scanned,
    subtitle_tracks_mapped: input.subtitle_tracks_mapped,
    audio_tracks_mapped: input.audio_tracks_mapped,
    duration_ms: input.duration_ms,
    started_at: input.started_at,
    completed_at: input.completed_at,
  };

  db.prepare(`
    INSERT OR REPLACE INTO scan_runs (
      id, mode, target, limit_count, files_scanned, subtitle_tracks_mapped, audio_tracks_mapped, duration_ms, started_at, completed_at
    ) VALUES (
      @id, @mode, @target, @limit_count, @files_scanned, @subtitle_tracks_mapped, @audio_tracks_mapped, @duration_ms, @started_at, @completed_at
    )
  `).run(row);

  return rowToScanRun(row);
}

export function listRecentScanRuns(limit = 10): ScanRun[] {
  const rows = getDb()
    .prepare("SELECT * FROM scan_runs ORDER BY completed_at DESC, started_at DESC LIMIT ?")
    .all(limit) as ScanRunRow[];

  return rows.map(rowToScanRun);
}

export function getFilePlanById(mediaFileId: string): FilePlan | null {
  const row = getDb()
    .prepare("SELECT * FROM file_plans WHERE media_file_id = ?")
    .get(mediaFileId) as FilePlanRow | undefined;

  return row ? rowToFilePlan(row) : null;
}

export function updateFilePlanProcessingState(
  mediaFileId: string,
  state: FilePlan["processingState"],
  options: {
    progressPercent?: number | null;
    processingMessage?: string | null;
  } = {},
): void {
  const updatedAt = new Date().toISOString();
  getDb()
    .prepare(`
      UPDATE file_plans
      SET processing_state = ?,
          progress_percent = ?,
          processing_message = ?,
          processing_updated_at = ?
      WHERE media_file_id = ?
    `)
    .run(state, options.progressPercent ?? null, options.processingMessage ?? null, updatedAt, mediaFileId);
}

export function tryStartProcessing(
  mediaFileId: string,
  message = "Queued for processing",
  maxConcurrentJobs?: number,
): boolean {
  const db = getDb();
  const countRunning = db.prepare(
    "SELECT COUNT(*) as count FROM file_plans WHERE processed_at IS NULL AND processing_state = 'running'",
  );
  const update = db.prepare(`
    UPDATE file_plans
    SET processing_state = 'running',
        progress_percent = 0,
        processing_message = ?,
        processing_updated_at = ?
    WHERE media_file_id = ?
      AND processed_at IS NULL
      AND processing_state != 'running'
      AND removable_track_count > 0
  `);

  const transaction = db.transaction((fileId: string, nextMessage: string, limit?: number) => {
    if (limit !== undefined) {
      const running = (countRunning.get() as { count: number }).count;
      if (running >= limit) {
        return false;
      }
    }

    const updatedAt = new Date().toISOString();
    const result = update.run(nextMessage, updatedAt, fileId);
    return result.changes > 0;
  });

  return transaction(mediaFileId, message, maxConcurrentJobs);
}

export function listRecentPlans(limit = 12, processedState: "all" | "processed" | "unprocessed" = "all"): FilePlan[] {
  const where =
    processedState === "processed"
      ? "WHERE processed_at IS NOT NULL"
      : processedState === "unprocessed"
        ? "WHERE processed_at IS NULL AND removable_track_count > 0"
        : "";

  const rows = getDb()
    .prepare(`SELECT * FROM file_plans ${where} ORDER BY planned_at DESC, path ASC LIMIT ?`)
    .all(limit) as FilePlanRow[];

  return rows.map(rowToFilePlan);
}

function buildQueueWhere(filters: QueueFilters = {}): { whereSql: string; params: unknown[] } {
  const where = ["processed_at IS NULL", "removable_track_count > 0"];
  const params: unknown[] = [];

  if (filters.status && filters.status !== "all") {
    where.push("processing_state = ?");
    params.push(filters.status);
  }

  if (filters.result && filters.result !== "all") {
    where.push("result = ?");
    params.push(filters.result);
  }

  if (filters.category && filters.category !== "all") {
    where.push(`${categoryCaseSql()} = ?`);
    params.push(filters.category);
  }

  if (filters.query?.trim()) {
    where.push("path LIKE ?");
    params.push(`%${filters.query.trim()}%`);
  }

  return {
    whereSql: `WHERE ${where.join(" AND ")}`,
    params,
  };
}

export function countQueuedPlans(filters: QueueFilters = {}): number {
  const { whereSql, params } = buildQueueWhere(filters);
  const row = getDb()
    .prepare(`SELECT COUNT(*) as count FROM file_plans ${whereSql}`)
    .get(...params) as { count: number };

  return row.count;
}

export function listQueuedPlansPage(filters: QueueFilters = {}, limit = 250, offset = 0): FilePlan[] {
  const { whereSql, params } = buildQueueWhere(filters);
  const rows = getDb()
    .prepare(`
      SELECT *
      FROM file_plans
      ${whereSql}
      ORDER BY
        CASE processing_state
          WHEN 'running' THEN 0
          WHEN 'failed' THEN 1
          WHEN 'queued' THEN 2
          ELSE 3
        END,
        planned_at DESC,
        path ASC
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset) as FilePlanRow[];

  return rows.map(rowToFilePlan);
}

export function listQueuedPlans(limit = 250): FilePlan[] {
  return listQueuedPlansPage({}, limit, 0);
}

export function getQueueCount(): number {
  return countQueuedPlans();
}

export function getFailedQueueCount(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM file_plans WHERE processed_at IS NULL AND removable_track_count > 0 AND processing_state = 'failed'")
    .get() as { count: number };

  return row.count;
}

export function listFailedPlans(limit = 250): FilePlan[] {
  const rows = getDb()
    .prepare(`
      SELECT *
      FROM file_plans
      WHERE processed_at IS NULL
        AND removable_track_count > 0
        AND processing_state = 'failed'
      ORDER BY processing_updated_at DESC, planned_at DESC, path ASC
      LIMIT ?
    `)
    .all(limit) as FilePlanRow[];

  return rows.map(rowToFilePlan);
}

export function resetPlansToQueued(mediaFileIds: string[], message = "Queued for retry"): number {
  if (mediaFileIds.length === 0) {
    return 0;
  }

  const updatedAt = new Date().toISOString();
  const update = getDb().prepare(`
    UPDATE file_plans
    SET processing_state = 'queued',
        progress_percent = 0,
        processing_message = ?,
        processing_updated_at = ?
    WHERE media_file_id = ?
      AND processed_at IS NULL
      AND removable_track_count > 0
      AND processing_state = 'failed'
  `);

  const tx = getDb().transaction((ids: string[]) => {
    let changed = 0;
    for (const id of ids) {
      changed += update.run(message, updatedAt, id).changes;
    }
    return changed;
  });

  return tx(mediaFileIds);
}

export function writeAppLog(
  level: AppLogLevel,
  source: AppLogSource,
  message: string,
  details: string | null = null,
  force = false,
): void {
  const settings = getSettings();
  if (level === "debug" && !settings.verboseLogging && !force) {
    return;
  }

  const createdAt = new Date().toISOString();
  const id = createHash("sha1")
    .update([level, source, message, details ?? "", createdAt, Math.random().toString(36)].join(":"))
    .digest("hex");

  getDb()
    .prepare("INSERT INTO app_logs (id, level, source, message, details, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, level, source, message, details, createdAt);
}

export function getMetaValue(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get(key) as { value?: string } | undefined;

  return row?.value ?? null;
}

export function setMetaValue(key: string, value: string): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)")
    .run(key, value);
}

export function getActiveScanState(): ActiveScanState | null {
  const raw = getMetaValue("activeScanState");
  if (!raw) {
    return null;
  }

  try {
    const state = JSON.parse(raw) as Partial<ActiveScanState>;
    return {
      audioTracksMapped: 0,
      ...state,
    } as ActiveScanState;
  } catch {
    return null;
  }
}

export function setActiveScanState(state: ActiveScanState): void {
  setMetaValue("activeScanState", JSON.stringify(state));
}

export function requestActiveScanCancel(): boolean {
  const current = getActiveScanState();
  if (!current || current.status !== "running" || current.cancelRequested) {
    return false;
  }

  setActiveScanState({
    ...current,
    cancelRequested: true,
    message: "Stopping after the current file finishes.",
  });
  return true;
}

export function listKnownPathsUnderRoot(root: string): string[] {
  const rows = getDb()
    .prepare("SELECT path FROM media_files WHERE path LIKE ?")
    .all(`${root}/%`) as Array<{ path: string }>;

  return rows.map((row) => row.path);
}

export function listAudioIncompletePathsUnderRoot(root: string): string[] {
  const rows = getDb()
    .prepare("SELECT path FROM media_files WHERE path LIKE ? AND audio_track_count = 0")
    .all(`${root}/%`) as Array<{ path: string }>;

  return rows.map((row) => row.path);
}

export function getQueueBatchState(): QueueBatchState {
  const raw = getMetaValue("queueBatchState");
  if (!raw) {
    return {
      status: "idle",
      source: "manual",
      startedAt: null,
      updatedAt: new Date().toISOString(),
      message: "Idle",
    };
  }

  try {
    return JSON.parse(raw) as QueueBatchState;
  } catch {
    return {
      status: "idle",
      source: "manual",
      startedAt: null,
      updatedAt: new Date().toISOString(),
      message: "Idle",
    };
  }
}

export function setQueueBatchState(state: QueueBatchState): void {
  setMetaValue("queueBatchState", JSON.stringify(state));
}

async function cleanupInterruptedWorkingFiles(inputPath: string): Promise<string[]> {
  if (!existsSync(inputPath)) {
    return [];
  }

  const dir = dirname(inputPath);
  const ext = extname(inputPath);
  const base = basename(inputPath, ext);
  const prefix = `.${base}.trimarr-working-`;

  try {
    const entries = await readdir(dir);
    const removed: string[] = [];

    for (const entry of entries) {
      if (!entry.startsWith(prefix) || !entry.endsWith(ext)) {
        continue;
      }

      const tempPath = join(dir, entry);
      await rm(tempPath, { force: true });
      removed.push(tempPath);
    }

    return removed;
  } catch {
    return [];
  }
}

export async function recoverInterruptedProcessingState(): Promise<void> {
  const db = getDb();
  const batchState = getQueueBatchState();
  const interruptedPlans = db
    .prepare(`
      SELECT media_file_id, path
      FROM file_plans
      WHERE processed_at IS NULL
        AND processing_state = 'running'
    `)
    .all() as Array<{ media_file_id: string; path: string }>;

  if (interruptedPlans.length === 0 && batchState.status === "idle") {
    return;
  }

  const updatedAt = new Date().toISOString();
  const message = "Interrupted by app restart. Rescan or retry after reviewing the file.";

  const markInterrupted = db.prepare(`
    UPDATE file_plans
    SET processing_state = 'failed',
        progress_percent = NULL,
        processing_message = ?,
        processing_updated_at = ?
    WHERE media_file_id = ?
      AND processed_at IS NULL
      AND processing_state = 'running'
  `);

  const transaction = db.transaction((plans: Array<{ media_file_id: string; path: string }>) => {
    for (const plan of plans) {
      markInterrupted.run(message, updatedAt, plan.media_file_id);
    }
  });

  transaction(interruptedPlans);

  if (batchState.status !== "idle") {
    setQueueBatchState({
      status: "idle",
      source: batchState.source,
      startedAt: null,
      updatedAt,
      message: "Recovered from interrupted processing after app restart.",
    });
  }

  for (const plan of interruptedPlans) {
    addFileHistoryEntry(plan.media_file_id, "failed", "Processing interrupted by app restart", {
      details: message,
    });
  }

  const removedTempFiles = (
    await Promise.all(interruptedPlans.map((plan) => cleanupInterruptedWorkingFiles(plan.path)))
  ).flat();

  writeAppLog(
    "warn",
    "queue",
    "Recovered interrupted queue state",
    `Reset queue batch to idle and marked ${interruptedPlans.length} stale running file(s) as failed. Removed ${removedTempFiles.length} interrupted working file(s).`,
    true,
  );
}

export function hasRunningPlans(): boolean {
  return countRunningPlans() > 0;
}

export function countRunningPlans(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM file_plans WHERE processed_at IS NULL AND processing_state = 'running'")
    .get() as { count: number };

  return row.count;
}

export function addFileHistoryEntry(
  mediaFileId: string,
  eventType: FileHistoryEntry["eventType"],
  message: string,
  options: {
    details?: string | null;
    sizeBeforeBytes?: number | null;
    sizeAfterBytes?: number | null;
  } = {},
): void {
  const createdAt = new Date().toISOString();
  const id = createHash("sha1")
    .update([mediaFileId, eventType, message, options.details ?? "", createdAt, Math.random().toString(36)].join(":"))
    .digest("hex");

  getDb()
    .prepare(`
      INSERT INTO file_history (
        id, media_file_id, event_type, message, details, size_before_bytes, size_after_bytes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      mediaFileId,
      eventType,
      message,
      options.details ?? null,
      options.sizeBeforeBytes ?? null,
      options.sizeAfterBytes ?? null,
      createdAt,
    );
}

export function listLogs(limit = 250): AppLogEntry[] {
  return listLogsPage({}, limit, 0);
}

function buildLogsWhere(filters: LogFilters = {}): { whereSql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.level && filters.level !== "all") {
    where.push("level = ?");
    params.push(filters.level);
  }

  if (filters.source && filters.source !== "all") {
    where.push("source = ?");
    params.push(filters.source);
  }

  if (filters.query?.trim()) {
    where.push("(message LIKE ? OR details LIKE ?)");
    const value = `%${filters.query.trim()}%`;
    params.push(value, value);
  }

  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

export function countLogs(filters: LogFilters = {}): number {
  const { whereSql, params } = buildLogsWhere(filters);
  const rows = getDb()
    .prepare(`SELECT COUNT(*) as count FROM app_logs ${whereSql}`)
    .get(...params) as { count: number };

  return rows.count;
}

export function pruneLogs(retentionDays: number): number {
  const days = Math.max(1, retentionDays);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result = getDb()
    .prepare("DELETE FROM app_logs WHERE created_at < ?")
    .run(cutoff);

  return result.changes;
}

export function listLogsPage(filters: LogFilters = {}, limit = 250, offset = 0): AppLogEntry[] {
  const { whereSql, params } = buildLogsWhere(filters);
  const rows = getDb()
    .prepare(`SELECT * FROM app_logs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as AppLogRow[];

  return rows.map(rowToAppLog);
}

export function listFileHistory(mediaFileId: string, limit = 50): FileHistoryEntry[] {
  const rows = getDb()
    .prepare("SELECT * FROM file_history WHERE media_file_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(mediaFileId, limit) as FileHistoryRow[];

  return rows.map(rowToFileHistory);
}

export function addTrashItem(input: {
  mediaFileId: string;
  originalPath: string;
  trashPath: string;
  sizeBytes: number;
  expiresAt: string | null;
}): TrashItem {
  const createdAt = new Date().toISOString();
  const id = createHash("sha1")
    .update([input.mediaFileId, input.originalPath, input.trashPath, createdAt].join(":"))
    .digest("hex");

  getDb()
    .prepare(`
      INSERT INTO trash_files (
        id, media_file_id, original_path, trash_path, size_bytes, created_at, expires_at, restored_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
    `)
    .run(id, input.mediaFileId, input.originalPath, input.trashPath, input.sizeBytes, createdAt, input.expiresAt);

  return {
    id,
    mediaFileId: input.mediaFileId,
    originalPath: input.originalPath,
    trashPath: input.trashPath,
    sizeBytes: input.sizeBytes,
    createdAt,
    expiresAt: input.expiresAt,
    restoredAt: null,
    deletedAt: null,
  };
}

export function getActiveTrashItem(mediaFileId: string): TrashItem | null {
  const row = getDb()
    .prepare(`
      SELECT *
      FROM trash_files
      WHERE media_file_id = ?
        AND restored_at IS NULL
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(mediaFileId) as TrashRow | undefined;

  return row ? rowToTrashItem(row) : null;
}

export function listTrashItems(limit = 500): TrashItem[] {
  const rows = getDb()
    .prepare(`
      SELECT *
      FROM trash_files
      WHERE restored_at IS NULL
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(limit) as TrashRow[];

  return rows.map(rowToTrashItem);
}

export function markTrashItemRestored(id: string): void {
  getDb()
    .prepare("UPDATE trash_files SET restored_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

export function markTrashItemDeleted(id: string): void {
  getDb()
    .prepare("UPDATE trash_files SET deleted_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

export function listProcessedFiles(limit = 500): ProcessedFileRecord[] {
  return listProcessedFilesPage({}, limit, 0);
}

function buildProcessedWhere(filters: HistoryFilters = {}): { whereSql: string; params: unknown[] } {
  const where = ["m.processed_at IS NOT NULL"];
  const params: unknown[] = [];

  if (filters.category && filters.category !== "all") {
    where.push(`${categoryCaseSql().replaceAll("path", "m.path")} = ?`);
    params.push(filters.category);
  }

  if (filters.outcome === "warnings") {
    where.push("m.processed_with_warnings = 1");
  } else if (filters.outcome === "success") {
    where.push("COALESCE(m.processed_with_warnings, 0) = 0");
  }

  if (filters.trashState === "with_trash") {
    where.push(`EXISTS(
      SELECT 1 FROM trash_files t
      WHERE t.media_file_id = m.id
        AND t.restored_at IS NULL
        AND t.deleted_at IS NULL
    )`);
  } else if (filters.trashState === "without_trash") {
    where.push(`NOT EXISTS(
      SELECT 1 FROM trash_files t
      WHERE t.media_file_id = m.id
        AND t.restored_at IS NULL
        AND t.deleted_at IS NULL
    )`);
  }

  if (filters.query?.trim()) {
    where.push("m.path LIKE ?");
    params.push(`%${filters.query.trim()}%`);
  }

  return {
    whereSql: `WHERE ${where.join(" AND ")}`,
    params,
  };
}

export function countProcessedFiles(filters: HistoryFilters = {}): number {
  const { whereSql, params } = buildProcessedWhere(filters);
  const row = getDb()
    .prepare(`SELECT COUNT(*) as count FROM media_files m ${whereSql}`)
    .get(...params) as { count: number };

  return row.count;
}

export function listProcessedFilesPage(filters: HistoryFilters = {}, limit = 500, offset = 0): ProcessedFileRecord[] {
  const { whereSql, params } = buildProcessedWhere(filters);
  const rows = getDb()
    .prepare(`
      SELECT
        m.id as media_file_id,
        m.path,
        m.processed_at,
        m.processed_with_warnings,
        m.size_before_bytes,
        m.size_after_bytes,
        m.result as last_result,
        m.subtitle_track_count,
        m.audio_track_count,
        m.keep_count,
        m.remove_count,
        EXISTS(
          SELECT 1
          FROM trash_files t
          WHERE t.media_file_id = m.id
            AND t.restored_at IS NULL
            AND t.deleted_at IS NULL
        ) as trash_available
      FROM media_files m
      ${whereSql}
      ORDER BY m.processed_at DESC, m.path ASC
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset) as Array<{
      media_file_id: string;
      path: string;
      processed_at: string;
      processed_with_warnings: number;
      size_before_bytes: number | null;
      size_after_bytes: number | null;
      last_result: PolicyResult;
      subtitle_track_count: number;
      audio_track_count: number;
      keep_count: number;
      remove_count: number;
      trash_available: number;
    }>;

  return rows.map((row) => ({
    mediaFileId: row.media_file_id,
    path: row.path,
    processedAt: row.processed_at,
    processedWithWarnings: Boolean(row.processed_with_warnings),
    sizeBeforeBytes: row.size_before_bytes,
    sizeAfterBytes: row.size_after_bytes,
    lastResult: row.last_result,
    subtitleTrackCount: row.subtitle_track_count,
    audioTrackCount: row.audio_track_count,
    keepCount: row.keep_count,
    removeCount: row.remove_count,
    trashAvailable: Boolean(row.trash_available),
  }));
}

export function getFileById(id: string): MediaFileRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM media_files WHERE id = ?").get(id) as FileRow | undefined;
  if (!row) {
    return null;
  }

  const tracks = (db
    .prepare("SELECT * FROM subtitle_tracks WHERE media_file_id = ? ORDER BY track_index ASC")
    .all(id) as TrackRow[]).map(rowToTrack);
  const audioTracks = (db
    .prepare("SELECT * FROM audio_tracks WHERE media_file_id = ? ORDER BY track_index ASC")
    .all(id) as AudioTrackRow[]).map(rowToAudioTrack);

  return rowToFile(row, tracks, audioTracks);
}

export function hasInventoryDb(): boolean {
  return existsSync(dbPath);
}
