import { spawn } from "node:child_process";
import { access, copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { inspectMediaFile } from "@/lib/scan";
import {
  addFileHistoryEntry,
  addTrashItem,
  getActiveTrashItem,
  getFileById,
  getFilePlanById,
  getSettings,
  listTrashItems,
  markFileProcessed,
  resetFileProcessedState,
  setFileProcessedWarnings,
  markTrashItemDeleted,
  markTrashItemRestored,
  upsertFiles,
  updateFilePlanProcessingState,
  writeAppLog,
} from "@/lib/storage";
import type { AudioTrack, SubtitleTrack } from "@/lib/types";

function workingPaths(inputPath: string) {
  const dir = dirname(inputPath);
  const ext = extname(inputPath);
  const base = basename(inputPath, ext);
  const stamp = `${Date.now()}-${process.pid}`;

  return {
    tempPath: `${dir}/.${base}.trimarr-working-${stamp}${ext}`,
    backupPath: `${dir}/.${base}.trimarr-backup-${stamp}${ext}`,
  };
}

function trashPaths(inputPath: string) {
  const stamp = `${Date.now()}-${process.pid}`;
  const trashDir = "/data/trash";
  const ext = extname(inputPath);
  const base = basename(inputPath, ext);

  return {
    trashDir,
    trashPath: join(trashDir, `${base}-${stamp}${ext}`),
  };
}

function parseProgress(line: string): number | null {
  const guiMatch = line.match(/#GUI#progress\s+(\d+)/i);
  if (guiMatch) {
    return Number(guiMatch[1]);
  }

  const percentMatch = line.match(/Progress:\s+(\d+)%/i);
  if (percentMatch) {
    return Number(percentMatch[1]);
  }

  return null;
}

function trackSignature(track: SubtitleTrack): string {
  return JSON.stringify({
    codec: track.codec,
    language: track.language,
    title: track.title,
    forced: track.forced,
    hearingImpaired: track.hearingImpaired,
    default: track.default,
  });
}

function audioTrackSignature(track: AudioTrack): string {
  return JSON.stringify({
    codec: track.codec,
    language: track.language,
    title: track.title,
    default: track.default,
    commentary: track.commentary,
    channels: track.channels,
  });
}

function validateProcessedSubtitleOutput(expectedKeepTracks: SubtitleTrack[], actualTracks: SubtitleTrack[]): void {
  const expected = expectedKeepTracks.map(trackSignature).sort();
  const actual = actualTracks.map(trackSignature).sort();

  if (expected.length !== actual.length) {
    throw new Error(`Validation failed: expected ${expected.length} kept subtitle tracks, found ${actual.length}.`);
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] !== actual[index]) {
      throw new Error("Validation failed: remuxed subtitle tracks do not match the planned keep set.");
    }
  }
}

function validateProcessedAudioOutput(expectedKeepTracks: AudioTrack[], actualTracks: AudioTrack[]): void {
  const expected = expectedKeepTracks.map(audioTrackSignature).sort();
  const actual = actualTracks.map(audioTrackSignature).sort();

  if (expected.length !== actual.length) {
    throw new Error(`Validation failed: expected ${expected.length} kept audio tracks, found ${actual.length}.`);
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] !== actual[index]) {
      throw new Error("Validation failed: remuxed audio tracks do not match the planned keep set.");
    }
  }
}

async function remuxFile(
  inputPath: string,
  outputPath: string,
  keepSubtitleTrackIndexes: number[],
  keepAudioTrackIndexes: number[],
  mediaFileId: string,
): Promise<{ warnings: string | null }> {
  const args = ["--gui-mode", "-o", outputPath];

  if (keepSubtitleTrackIndexes.length > 0) {
    args.push("--subtitle-tracks", keepSubtitleTrackIndexes.join(","));
  } else {
    args.push("--no-subtitles");
  }

  if (keepAudioTrackIndexes.length > 0) {
    args.push("--audio-tracks", keepAudioTrackIndexes.join(","));
  } else {
    args.push("--no-audio");
  }

  args.push(inputPath);

  return await new Promise<{ warnings: string | null }>((resolve, reject) => {
    const child = spawn("/usr/bin/mkvmerge", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    function handleChunk(chunk: Buffer) {
      const text = chunk.toString();
      stderr += text;

      for (const line of text.split(/\r?\n/)) {
        const progress = parseProgress(line);
        if (progress !== null) {
          updateFilePlanProcessingState(mediaFileId, "running", {
            progressPercent: progress,
            processingMessage: `Remuxing ${progress}%`,
          });
          writeAppLog("debug", "process", `Processing ${mediaFileId}`, `Remux progress ${progress}%`);
        }
      }
    }

    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ warnings: null });
        return;
      }

      if (code === 1) {
        resolve({ warnings: stderr.trim() || null });
        return;
      }

      reject(new Error(stderr.trim() || `mkvmerge exited with code ${code}`));
    });
  });
}

export async function processFilePlan(mediaFileId: string): Promise<void> {
  const file = getFileById(mediaFileId);
  const plan = getFilePlanById(mediaFileId);
  const settings = getSettings();

  if (!file || !plan) {
    throw new Error("File plan not found.");
  }

  if (file.removableTrackCount === 0) {
    updateFilePlanProcessingState(mediaFileId, "idle", {
      processingMessage: "Nothing to process.",
      progressPercent: null,
    });
    return;
  }

  const keepSubtitleTracks = file.tracks.filter((track) => track.decision === "keep");
  const keepSubtitleTrackIndexes = keepSubtitleTracks.map((track) => track.index);
  const keepAudioTracks = file.audioTracks.filter((track) => track.decision === "keep");
  const keepAudioTrackIndexes = keepAudioTracks.map((track) => track.index);
  const { tempPath, backupPath } = workingPaths(file.path);
  const processedAt = new Date().toISOString();

  if (file.audioTrackCount > 0 && keepAudioTracks.length === 0) {
    throw new Error("Refusing to process because the current audio keep policy would remove every audio track.");
  }

  updateFilePlanProcessingState(mediaFileId, "running", {
    progressPercent: 0,
    processingMessage: "Preparing remux",
  });
  writeAppLog(
    "info",
    "process",
    `Started processing ${file.path}`,
    `Keep subtitles: ${keepSubtitleTrackIndexes.join(", ") || "none"} | keep audio: ${keepAudioTrackIndexes.join(", ") || "none"}`,
  );
  addFileHistoryEntry(mediaFileId, "started", "Processing started", {
    details: `Keep subtitles: ${keepSubtitleTrackIndexes.join(", ") || "none"} | keep audio: ${keepAudioTrackIndexes.join(", ") || "none"}`,
    sizeBeforeBytes: file.fileSizeBytes,
  });

  try {
    await access(file.path, constants.R_OK | constants.W_OK);
    const remuxResult = await remuxFile(file.path, tempPath, keepSubtitleTrackIndexes, keepAudioTrackIndexes, mediaFileId);

    if (remuxResult.warnings) {
      setFileProcessedWarnings(mediaFileId, true);
      addFileHistoryEntry(mediaFileId, "validated", "Remux completed with source file warnings", {
        details: remuxResult.warnings,
        sizeBeforeBytes: file.fileSizeBytes,
      });
      writeAppLog(
        "warn",
        "process",
        `Remux completed with warnings for ${file.path}`,
        remuxResult.warnings,
      );
    }

    updateFilePlanProcessingState(mediaFileId, "running", {
      progressPercent: 95,
      processingMessage: "Verifying output",
    });

    const outputStats = await stat(tempPath);
    const processedFile = await inspectMediaFile(tempPath);
    validateProcessedSubtitleOutput(keepSubtitleTracks, processedFile.tracks);
    validateProcessedAudioOutput(keepAudioTracks, processedFile.audioTracks);
    addFileHistoryEntry(mediaFileId, "validated", "Validation passed", {
      details: `Validated ${processedFile.tracks.length} subtitle tracks and ${processedFile.audioTracks.length} audio tracks against the plan.`,
      sizeBeforeBytes: file.fileSizeBytes,
      sizeAfterBytes: outputStats.size,
    });
    writeAppLog(
      "info",
      "process",
      `Validated remux output for ${file.path}`,
      `Validated ${processedFile.tracks.length} subtitle tracks and ${processedFile.audioTracks.length} audio tracks.`,
    );

    updateFilePlanProcessingState(mediaFileId, "running", {
      progressPercent: 98,
      processingMessage: "Replacing original file",
    });

    await rename(file.path, backupPath);
    await rename(tempPath, file.path);

    if (settings.trashEnabled) {
      const { trashDir, trashPath } = trashPaths(file.path);
      await mkdir(trashDir, { recursive: true });
      await copyFile(backupPath, trashPath);
      await addTrashItem({
        mediaFileId,
        originalPath: file.path,
        trashPath,
        sizeBytes: file.fileSizeBytes,
        expiresAt:
          settings.trashRetentionDays > 0
            ? new Date(Date.now() + settings.trashRetentionDays * 24 * 60 * 60 * 1000).toISOString()
            : null,
      });
      addFileHistoryEntry(mediaFileId, "trashed", "Original file copied to trash", {
        details: `Trash duplicate created at ${trashPath}`,
        sizeBeforeBytes: file.fileSizeBytes,
      });
      writeAppLog("info", "process", `Created trash duplicate for ${file.path}`, trashPath);
    }

    const finalStats = await stat(file.path);
    const finalFile = await inspectMediaFile(file.path);
    validateProcessedSubtitleOutput(keepSubtitleTracks, finalFile.tracks);
    validateProcessedAudioOutput(keepAudioTracks, finalFile.audioTracks);

    finalFile.processedAt = processedAt;
    finalFile.processedWithWarnings = Boolean(remuxResult.warnings);
    finalFile.sizeBeforeBytes = file.fileSizeBytes;
    finalFile.sizeAfterBytes = finalStats.size;
    upsertFiles([finalFile]);
    markFileProcessed(
      mediaFileId,
      file.fileSizeBytes,
      finalStats.size,
      file.subtitleRemoveCount,
      file.audioRemoveCount,
    );

    addFileHistoryEntry(mediaFileId, "validated", "Final file rescan passed", {
      details: `Rescanned the replaced file and confirmed ${finalFile.tracks.length} subtitle tracks and ${finalFile.audioTracks.length} audio tracks remain.`,
      sizeBeforeBytes: file.fileSizeBytes,
      sizeAfterBytes: finalStats.size,
    });
    writeAppLog(
      "info",
      "process",
      `Rescanned final file for ${file.path}`,
      `Confirmed ${finalFile.tracks.length} subtitle tracks and ${finalFile.audioTracks.length} audio tracks after replacement.`,
    );

    await rm(backupPath, { force: true });

    addFileHistoryEntry(mediaFileId, "completed", "Processing completed", {
      details: `File replaced successfully after validation.`,
      sizeBeforeBytes: file.fileSizeBytes,
      sizeAfterBytes: finalStats.size,
    });
    writeAppLog(
      "info",
      "process",
      `Completed processing ${file.path}`,
      `Size before ${file.fileSizeBytes}, size after ${finalStats.size}`,
    );
  } catch (error) {
    try {
      await access(backupPath, constants.F_OK);
      await rm(file.path, { force: true }).catch(() => undefined);
      await rename(backupPath, file.path);
    } catch {
      // ignore backup restore failures here; surface original processing error first
    }

    await rm(tempPath, { force: true }).catch(() => undefined);

    updateFilePlanProcessingState(mediaFileId, "failed", {
      progressPercent: null,
      processingMessage: error instanceof Error ? error.message : "Processing failed.",
    });
    addFileHistoryEntry(mediaFileId, "failed", "Processing failed", {
      details: error instanceof Error ? error.message : "Processing failed.",
      sizeBeforeBytes: file.fileSizeBytes,
    });
    writeAppLog(
      "error",
      "process",
      `Processing failed for ${file.path}`,
      error instanceof Error ? error.message : "Processing failed.",
    );
    throw error;
  }
}

export async function revertProcessedFile(mediaFileId: string): Promise<void> {
  const file = getFileById(mediaFileId);
  const trashItem = getActiveTrashItem(mediaFileId);

  if (!file || !trashItem) {
    throw new Error("No active trash file is available for revert.");
  }

  const { tempPath } = workingPaths(file.path);
  await access(trashItem.trashPath, constants.F_OK | constants.R_OK | constants.W_OK);

    await rename(file.path, tempPath);
  try {
    await rename(trashItem.trashPath, file.path);
    await rm(tempPath, { force: true });
    const restoredFile = await inspectMediaFile(file.path);
    resetFileProcessedState(mediaFileId, restoredFile.removableTrackCount);
    upsertFiles([restoredFile]);
    markTrashItemRestored(trashItem.id);
    addFileHistoryEntry(mediaFileId, "reverted", "Reverted processed file", {
      details: `Restored original file from ${trashItem.trashPath}`,
      sizeBeforeBytes: file.sizeAfterBytes ?? file.fileSizeBytes,
      sizeAfterBytes: trashItem.sizeBytes,
    });
    writeAppLog("info", "process", `Reverted ${file.path}`, `Restored original from trash item ${trashItem.id}`);
  } catch (error) {
    await rename(tempPath, file.path).catch(() => undefined);
    throw error;
  }
}

export async function emptyTrash(): Promise<number> {
  const items = listTrashItems(1000);
  let removed = 0;

  for (const item of items) {
    await rm(item.trashPath, { force: true }).catch(() => undefined);
    markTrashItemDeleted(item.id);
    writeAppLog("info", "system", `Deleted trash file for ${item.originalPath}`, item.trashPath);
    removed += 1;
  }

  return removed;
}
