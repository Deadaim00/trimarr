import { NextResponse } from "next/server";
import { getSettings, pruneLogs, saveSettings, writeAppLog } from "@/lib/storage";
import { DEFAULT_SETTINGS, SERVER_LOCAL_TIMEZONE } from "@/lib/config";
import type { TrimarrSettings } from "@/lib/types";

type SettingsBody = {
  scanRoots?: string[];
  scanLimit?: number;
  maxConcurrentJobs?: number;
  libraryPathPrefix?: string;
  subtitleProcessingEnabled?: boolean;
  keepEnglishSubtitleTracks?: boolean;
  keepForcedEnglishSubtitles?: boolean;
  keepEnglishSdhSubtitles?: boolean;
  audioProcessingEnabled?: boolean;
  keepEnglishAudio?: boolean;
  keepCommentaryAudio?: boolean;
  keepUnknownAudio?: boolean;
  keepDefaultAudio?: boolean;
  scheduleEnabled?: boolean;
  scheduleRunAt?: string;
  scheduleEndAt?: string;
  scheduleTimeZone?: string;
  scheduleScanBeforeProcessing?: boolean;
  scheduleScanNewOrChangedOnly?: boolean;
  scheduleProcessUnprocessedOnly?: boolean;
  webhookEnabled?: boolean;
  webhookAutoProcessWhenIdle?: boolean;
  verboseLogging?: boolean;
  logRetentionDays?: number;
  trashEnabled?: boolean;
  trashRetentionDays?: number;
  webhookToken?: string;
};

function normalizeScheduleRunAt(input: unknown): string {
  if (typeof input !== "string") {
    return DEFAULT_SETTINGS.scheduleRunAt;
  }

  const trimmed = input.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : DEFAULT_SETTINGS.scheduleRunAt;
}

function normalizeScheduleTimeZone(input: unknown): string {
  if (typeof input !== "string") {
    return DEFAULT_SETTINGS.scheduleTimeZone;
  }

  const trimmed = input.trim();
  if (trimmed === SERVER_LOCAL_TIMEZONE) {
    return trimmed;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return DEFAULT_SETTINGS.scheduleTimeZone;
  }
}

function normalizeScanRoots(input: unknown, libraryPathPrefix: string): string[] {
  if (!Array.isArray(input)) {
    return DEFAULT_SETTINGS.scanRoots;
  }

  const roots = input
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .filter((value) => value.startsWith(libraryPathPrefix));

  return roots.length > 0 ? roots : DEFAULT_SETTINGS.scanRoots;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SettingsBody;
    const current = getSettings();
    const libraryPathPrefix =
      typeof body.libraryPathPrefix === "string" && body.libraryPathPrefix.startsWith("/")
        ? body.libraryPathPrefix
        : current.libraryPathPrefix;

    const nextSettings: TrimarrSettings = {
      scanRoots: normalizeScanRoots(body.scanRoots ?? current.scanRoots, libraryPathPrefix),
      scanLimit: Math.min(100, Math.max(1, Number(body.scanLimit ?? current.scanLimit))),
      maxConcurrentJobs: Math.min(4, Math.max(1, Number(body.maxConcurrentJobs ?? current.maxConcurrentJobs))),
      libraryPathPrefix,
      subtitleProcessingEnabled: body.subtitleProcessingEnabled ?? current.subtitleProcessingEnabled,
      keepEnglishSubtitleTracks: body.keepEnglishSubtitleTracks ?? current.keepEnglishSubtitleTracks,
      keepForcedEnglishSubtitles: body.keepForcedEnglishSubtitles ?? current.keepForcedEnglishSubtitles,
      keepEnglishSdhSubtitles: body.keepEnglishSdhSubtitles ?? current.keepEnglishSdhSubtitles,
      audioProcessingEnabled: body.audioProcessingEnabled ?? current.audioProcessingEnabled,
      keepEnglishAudio: body.keepEnglishAudio ?? current.keepEnglishAudio,
      keepCommentaryAudio: body.keepCommentaryAudio ?? current.keepCommentaryAudio,
      keepUnknownAudio: body.keepUnknownAudio ?? current.keepUnknownAudio,
      keepDefaultAudio: body.keepDefaultAudio ?? current.keepDefaultAudio,
      scheduleEnabled: body.scheduleEnabled ?? current.scheduleEnabled,
      scheduleRunAt: normalizeScheduleRunAt(body.scheduleRunAt ?? current.scheduleRunAt),
      scheduleEndAt: normalizeScheduleRunAt(body.scheduleEndAt ?? current.scheduleEndAt),
      scheduleTimeZone: normalizeScheduleTimeZone(body.scheduleTimeZone ?? current.scheduleTimeZone),
      scheduleScanBeforeProcessing: body.scheduleScanBeforeProcessing ?? current.scheduleScanBeforeProcessing,
      scheduleScanNewOrChangedOnly: body.scheduleScanNewOrChangedOnly ?? current.scheduleScanNewOrChangedOnly,
      scheduleProcessUnprocessedOnly:
        body.scheduleProcessUnprocessedOnly ?? current.scheduleProcessUnprocessedOnly,
      webhookEnabled: body.webhookEnabled ?? current.webhookEnabled,
      webhookAutoProcessWhenIdle: body.webhookAutoProcessWhenIdle ?? current.webhookAutoProcessWhenIdle,
      verboseLogging: body.verboseLogging ?? current.verboseLogging,
      logRetentionDays: Math.min(365, Math.max(1, Number(body.logRetentionDays ?? current.logRetentionDays))),
      trashEnabled: body.trashEnabled ?? current.trashEnabled,
      trashRetentionDays: Math.min(365, Math.max(1, Number(body.trashRetentionDays ?? current.trashRetentionDays))),
      webhookToken: typeof body.webhookToken === "string" ? body.webhookToken.trim() : current.webhookToken,
    };

    if (nextSettings.webhookEnabled && nextSettings.webhookToken.length === 0) {
      return NextResponse.json({ message: "A webhook API key is required when webhooks are enabled." }, { status: 400 });
    }

    const saved = saveSettings(nextSettings);
    const prunedLogs = pruneLogs(saved.logRetentionDays);
    writeAppLog(
      "info",
      "settings",
      "Settings updated",
      JSON.stringify({
        scanRoots: saved.scanRoots,
        scanLimit: saved.scanLimit,
        maxConcurrentJobs: saved.maxConcurrentJobs,
        subtitleProcessingEnabled: saved.subtitleProcessingEnabled,
        keepEnglishSubtitleTracks: saved.keepEnglishSubtitleTracks,
        keepForcedEnglishSubtitles: saved.keepForcedEnglishSubtitles,
        keepEnglishSdhSubtitles: saved.keepEnglishSdhSubtitles,
        audioProcessingEnabled: saved.audioProcessingEnabled,
        keepEnglishAudio: saved.keepEnglishAudio,
        keepCommentaryAudio: saved.keepCommentaryAudio,
        keepUnknownAudio: saved.keepUnknownAudio,
        keepDefaultAudio: saved.keepDefaultAudio,
        scheduleEnabled: saved.scheduleEnabled,
        scheduleRunAt: saved.scheduleRunAt,
        scheduleEndAt: saved.scheduleEndAt,
        scheduleTimeZone: saved.scheduleTimeZone,
        scheduleScanBeforeProcessing: saved.scheduleScanBeforeProcessing,
        scheduleScanNewOrChangedOnly: saved.scheduleScanNewOrChangedOnly,
        webhookEnabled: saved.webhookEnabled,
        webhookAutoProcessWhenIdle: saved.webhookAutoProcessWhenIdle,
        verboseLogging: saved.verboseLogging,
        logRetentionDays: saved.logRetentionDays,
        prunedLogs,
        trashEnabled: saved.trashEnabled,
        trashRetentionDays: saved.trashRetentionDays,
        webhookTokenConfigured: saved.webhookToken.length > 0,
      }),
      true,
    );
    return NextResponse.json({ message: "Settings saved.", settings: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save settings.";
    writeAppLog("error", "settings", "Settings save failed", message, true);
    return NextResponse.json({ message }, { status: 500 });
  }
}
