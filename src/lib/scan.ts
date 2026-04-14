import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_SCAN_ROOTS } from "@/lib/config";
import { getSettings } from "@/lib/storage";
import type { AudioDecision, AudioTrack, MediaFileRecord, PolicyResult, SubtitleDecision, SubtitleTrack } from "@/lib/types";

const execFileAsync = promisify(execFile);

const SUPPORTED_EXTENSIONS = new Set([".mkv"]);
const ENGLISH_CODES = new Set(["en", "eng", "english"]);
const UNKNOWN_CODES = new Set(["", "und", "unk", "unknown"]);

type ProbeStream = {
  index?: number;
  codec_name?: string;
  codec_type?: string;
  channels?: number;
  disposition?: {
    forced?: number;
    default?: number;
    hearing_impaired?: number;
  };
  tags?: {
    language?: string;
    title?: string;
  };
};

export function getDefaultRoots(): string[] {
  return DEFAULT_SCAN_ROOTS;
}

function trackIdFor(filePath: string, streamIndex: number): string {
  return createHash("sha1").update(`${filePath}:${streamIndex}`).digest("hex");
}

function fileIdFor(path: string): string {
  return createHash("sha1").update(path).digest("hex");
}

function extensionFor(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot).toLowerCase();
}

function normalizeLanguage(input?: string): string {
  return (input ?? "und").trim().toLowerCase();
}

function classifySubtitleTrack(stream: ProbeStream, path: string): SubtitleTrack | null {
  if (stream.codec_type !== "subtitle") {
    return null;
  }

  const settings = getSettings();
  const language = normalizeLanguage(stream.tags?.language);
  const title = (stream.tags?.title ?? "").trim();
  const forced = Boolean(stream.disposition?.forced);
  const hearingImpaired = Boolean(stream.disposition?.hearing_impaired) || /\bsdh\b|\bhi\b/i.test(title);
  const defaultTrack = Boolean(stream.disposition?.default);

  let decision: SubtitleDecision;
  let reason: string;

  if (!settings.subtitleProcessingEnabled) {
    decision = "keep";
    reason = "Subtitle processing is disabled.";
  } else if (ENGLISH_CODES.has(language) && forced && settings.keepForcedEnglishSubtitles) {
    decision = "keep";
    reason = "Keep English forced tracks by default.";
  } else if (ENGLISH_CODES.has(language) && hearingImpaired && settings.keepEnglishSdhSubtitles) {
    decision = "keep";
    reason = "Keep English SDH / hearing-impaired tracks by default.";
  } else if (ENGLISH_CODES.has(language) && settings.keepEnglishSubtitleTracks) {
    decision = "keep";
    reason = "Keep standard English tracks by default.";
  } else {
    decision = "remove";
    reason = UNKNOWN_CODES.has(language)
      ? "Track does not match the current keep policy."
      : "Non-English track does not match the current keep policy.";
  }

  return {
    id: trackIdFor(path, stream.index ?? -1),
    index: stream.index ?? -1,
    codec: stream.codec_name ?? "unknown",
    language,
    title,
    forced,
    hearingImpaired,
    default: defaultTrack,
    decision,
    reason,
  };
}

function classifyAudioTrack(stream: ProbeStream, path: string, totalAudioTracks: number): AudioTrack | null {
  if (stream.codec_type !== "audio") {
    return null;
  }

  const settings = getSettings();
  const language = normalizeLanguage(stream.tags?.language);
  const title = (stream.tags?.title ?? "").trim();
  const defaultTrack = Boolean(stream.disposition?.default);
  const commentary = /\bcommentary\b|\bcommentator\b/i.test(title);

  let decision: AudioDecision;
  let reason: string;

  if (!settings.audioProcessingEnabled) {
    decision = "keep";
    reason = "Audio processing is disabled.";
  } else if (totalAudioTracks === 1 && settings.keepSingleAudioTrack) {
    decision = "keep";
    reason = "Keep the only audio track for safety.";
  } else if (commentary && !settings.keepCommentaryAudio) {
    decision = "remove";
    reason = "Commentary audio is disabled in the current keep policy.";
  } else if (commentary && settings.keepCommentaryAudio) {
    decision = "keep";
    reason = "Keep commentary audio tracks by default.";
  } else if (ENGLISH_CODES.has(language) && settings.keepEnglishAudio) {
    decision = "keep";
    reason = "Keep English audio tracks by default.";
  } else if (UNKNOWN_CODES.has(language) && settings.keepUnknownAudio) {
    decision = "keep";
    reason = "Keep unknown-language audio tracks for safety.";
  } else if (defaultTrack && settings.keepDefaultAudio) {
    decision = "keep";
    reason = "Keep default audio tracks for safety.";
  } else {
    decision = "remove";
    reason = "Audio track does not match the current keep policy.";
  }

  return {
    id: trackIdFor(path, stream.index ?? -1),
    index: stream.index ?? -1,
    codec: stream.codec_name ?? "unknown",
    language,
    title,
    default: defaultTrack,
    commentary,
    channels: typeof stream.channels === "number" ? stream.channels : null,
    decision,
    reason,
  };
}

function determineResult(keepCount: number): PolicyResult {
  if (keepCount === 0) {
    return "no_keep";
  }

  return "matched";
}

async function probeFile(path: string): Promise<ProbeStream[]> {
  const { stdout } = await execFileAsync("/usr/bin/ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    path,
  ]);

  const parsed = JSON.parse(stdout) as { streams?: ProbeStream[] };
  return parsed.streams ?? [];
}

export async function inspectMediaFile(path: string): Promise<MediaFileRecord> {
  const fileStats = await stat(path);
  const streams = await probeFile(path);
  const tracks = streams
    .map((stream) => classifySubtitleTrack(stream, path))
    .filter((track): track is SubtitleTrack => Boolean(track));
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
  const audioTracks = audioStreams
    .map((stream) => classifyAudioTrack(stream, path, audioStreams.length))
    .filter((track): track is AudioTrack => Boolean(track));
  const subtitleKeepCount = tracks.filter((track) => track.decision === "keep").length;
  const subtitleRemoveCount = tracks.filter((track) => track.decision === "remove").length;
  const audioKeepCount = audioTracks.filter((track) => track.decision === "keep").length;
  const audioRemoveCount = audioTracks.filter((track) => track.decision === "remove").length;
  const keepCount = subtitleKeepCount + audioKeepCount;
  const removeCount = subtitleRemoveCount + audioRemoveCount;

  return {
    id: fileIdFor(path),
    path,
    container: extensionFor(path).replace(".", "") || "unknown",
    fileSizeBytes: fileStats.size,
    scannedAt: new Date().toISOString(),
    result: determineResult(keepCount),
    processedAt: null,
    processedWithWarnings: false,
    sizeBeforeBytes: null,
    sizeAfterBytes: null,
    processedSubtitleRemovedCount: 0,
    processedAudioRemovedCount: 0,
    keepCount,
    removeCount,
    subtitleTrackCount: tracks.length,
    subtitleKeepCount,
    subtitleRemoveCount,
    audioTrackCount: audioTracks.length,
    audioKeepCount,
    audioRemoveCount,
    removableTrackCount: removeCount,
    tracks,
    audioTracks,
  };
}

type WalkOptions = {
  includePath?: (path: string) => Promise<boolean>;
  shouldCancel?: () => boolean;
};

async function walkMkvFiles(root: string, limit: number | null, options: WalkOptions = {}): Promise<string[]> {
  const pending = [root];
  const files: string[] = [];

  while (pending.length > 0 && (limit === null || files.length < limit)) {
    if (options.shouldCancel?.()) {
      break;
    }

    const current = pending.shift();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = `${current}/${entry.name}`;
      if (entry.isDirectory()) {
        pending.push(nextPath);
        continue;
      }

      if (entry.isFile() && SUPPORTED_EXTENSIONS.has(extensionFor(entry.name))) {
        if (options.includePath) {
          const shouldInclude = await options.includePath(nextPath);
          if (!shouldInclude) {
            continue;
          }
        }

        files.push(nextPath);
        if (limit !== null && files.length >= limit) {
          break;
        }
      }
    }
  }

  return files;
}

export async function inspectRoot(root: string, limit: number | null = 10): Promise<MediaFileRecord[]> {
  const files = await walkMkvFiles(root, limit);
  return inspectRootFiles(files);
}

export async function inspectRootFiles(
  files: string[],
  onProgress?: (progress: { totalFiles: number; scannedFiles: number; subtitleTracksMapped: number; audioTracksMapped: number; currentPath: string }) => void,
  shouldCancel?: () => boolean,
): Promise<MediaFileRecord[]> {
  const records: MediaFileRecord[] = [];
  let subtitleTracksMapped = 0;
  let audioTracksMapped = 0;

  for (const path of files) {
    if (shouldCancel?.()) {
      break;
    }

    try {
      const record = await inspectMediaFile(path);
      records.push(record);
      subtitleTracksMapped += record.subtitleTrackCount;
      audioTracksMapped += record.audioTrackCount;
    } catch {
      // Skip unreadable or unsupported files in the MVP.
    }

    onProgress?.({
      totalFiles: files.length,
      scannedFiles: records.length,
      subtitleTracksMapped,
      audioTracksMapped,
      currentPath: path,
    });
  }

  return records;
}

export async function listRootMediaFiles(root: string, limit: number | null = 10): Promise<string[]> {
  return walkMkvFiles(root, limit);
}

export async function listRootNewOrChangedMediaFiles(
  root: string,
  sinceIso: string | null,
  knownPaths: Set<string>,
  alwaysIncludePaths: Set<string> = new Set<string>(),
  shouldCancel?: () => boolean,
): Promise<string[]> {
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : 0;

  return walkMkvFiles(root, null, {
    shouldCancel,
    includePath: async (path) => {
      if (alwaysIncludePaths.has(path)) {
        return true;
      }

      const fileStats = await stat(path);
      if (!knownPaths.has(path)) {
        return true;
      }

      if (!Number.isFinite(sinceMs) || sinceMs <= 0) {
        return true;
      }

      return fileStats.mtimeMs > sinceMs;
    },
  });
}
