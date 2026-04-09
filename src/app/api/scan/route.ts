import { NextResponse } from "next/server";
import { inspectMediaFile, inspectRootFiles, listRootMediaFiles } from "@/lib/scan";
import {
  getActiveScanState,
  getSettings,
  recordScanRun,
  requestActiveScanCancel,
  setActiveScanState,
  setMetaValue,
  upsertFiles,
  writeAppLog,
} from "@/lib/storage";
import type { ActiveScanState } from "@/lib/types";

type ScanBody =
  | {
      mode: "file";
      path: string;
    }
  | {
      mode: "root";
      root: string;
      limit?: number;
      scanAll?: boolean;
    }
  | {
      mode: "cancel";
    };

export async function GET() {
  return NextResponse.json({
    scan: getActiveScanState(),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScanBody;
    const settings = getSettings();
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();

    if (body.mode === "file") {
      if (!body.path?.startsWith(settings.libraryPathPrefix)) {
        return NextResponse.json(
          { message: `For now, Trimarr only inspects files mounted under ${settings.libraryPathPrefix}.` },
          { status: 400 },
        );
      }

      setActiveScanState({
        status: "running",
        mode: "file",
        target: body.path,
        totalFiles: 1,
        scannedFiles: 0,
        subtitleTracksMapped: 0,
        audioTracksMapped: 0,
        startedAt,
        completedAt: null,
        message: "Inspecting file",
        cancelRequested: false,
      });

      const file = await inspectMediaFile(body.path);
      upsertFiles([file]);
      const completedAt = new Date().toISOString();
      setActiveScanState({
        status: "completed",
        mode: "file",
        target: body.path,
        totalFiles: 1,
        scannedFiles: 1,
        subtitleTracksMapped: file.subtitleTrackCount,
        audioTracksMapped: file.audioTrackCount,
        startedAt,
        completedAt,
        message: `Inspected ${body.path}`,
        cancelRequested: false,
      });
      recordScanRun({
        mode: "file",
        target: body.path,
        limit_count: 1,
        files_scanned: 1,
        subtitle_tracks_mapped: file.subtitleTrackCount,
        audio_tracks_mapped: file.audioTrackCount,
        duration_ms: Date.now() - startedMs,
        started_at: startedAt,
        completed_at: completedAt,
      });
      writeAppLog(
        "info",
        "scan",
        `Inspected file ${body.path}`,
        `Found ${file.subtitleTrackCount} subtitle tracks and ${file.audioTrackCount} audio tracks.`,
      );
      return NextResponse.json({
        message: `Inspected ${body.path}. Found ${file.subtitleTrackCount} subtitle tracks and ${file.audioTrackCount} audio tracks.`,
      });
    }

    if (body.mode === "root") {
      const allowedRoots = new Set(settings.scanRoots);
      if (!allowedRoots.has(body.root)) {
        return NextResponse.json({ message: "That root is not enabled in this MVP." }, { status: 400 });
      }

      const scanFiles = await listRootMediaFiles(body.root, body.scanAll ? null : (body.limit ?? settings.scanLimit));
      setActiveScanState({
        status: "running",
        mode: "root",
        target: body.root,
        totalFiles: scanFiles.length,
        scannedFiles: 0,
        subtitleTracksMapped: 0,
        audioTracksMapped: 0,
        startedAt,
        completedAt: null,
        message: scanFiles.length === 0 ? "No files found to scan." : "Scanning files",
        cancelRequested: false,
      });
      const records = await inspectRootFiles(
        scanFiles,
        ({ totalFiles, scannedFiles, subtitleTracksMapped, audioTracksMapped, currentPath }) => {
          const cancelRequested = getActiveScanState()?.cancelRequested ?? false;
          setActiveScanState({
            status: "running",
            mode: "root",
            target: body.root,
            totalFiles,
            scannedFiles,
            subtitleTracksMapped,
            audioTracksMapped,
            startedAt,
            completedAt: null,
            message: cancelRequested
              ? "Stopping after the current file finishes."
              : `Scanning ${currentPath.split("/").at(-1) ?? currentPath}`,
            cancelRequested,
          });
        },
        () => getActiveScanState()?.cancelRequested === true,
      );
      upsertFiles(records);
      const completedAt = new Date().toISOString();
      const subtitleTrackCount = records.reduce((total, record) => total + record.subtitleTrackCount, 0);
      const audioTrackCount = records.reduce((total, record) => total + record.audioTrackCount, 0);
      const cancelRequested = getActiveScanState()?.cancelRequested ?? false;
      if (!cancelRequested) {
        setMetaValue("lastRootScanCompletedAt", completedAt);
      }
      setActiveScanState({
        status: cancelRequested ? "cancelled" : "completed",
        mode: "root",
        target: body.root,
        totalFiles: scanFiles.length,
        scannedFiles: records.length,
        subtitleTracksMapped: subtitleTrackCount,
        audioTracksMapped: audioTrackCount,
        startedAt,
        completedAt,
        message: cancelRequested
          ? `Scan cancelled after ${records.length} files.`
          : body.scanAll
            ? `Scanned all ${records.length} files.`
            : `Scanned ${records.length} files.`,
        cancelRequested,
      });
      recordScanRun({
        mode: "root",
        target: body.root,
        limit_count: body.scanAll ? null : (body.limit ?? settings.scanLimit),
        files_scanned: records.length,
        subtitle_tracks_mapped: subtitleTrackCount,
        audio_tracks_mapped: audioTrackCount,
        duration_ms: Date.now() - startedMs,
        started_at: startedAt,
        completed_at: completedAt,
      });
      writeAppLog(
        "info",
        "scan",
        cancelRequested
          ? `Cancelled scan under ${body.root}`
          : body.scanAll
            ? `Scanned all files under ${body.root}`
            : `Scanned root ${body.root}`,
        `Files: ${records.length}, subtitle tracks: ${subtitleTrackCount}, audio tracks: ${audioTrackCount}`,
      );
      return NextResponse.json({
        message: cancelRequested
          ? `Cancelled scan after ${records.length} files under ${body.root}.`
          : body.scanAll
            ? `Scanned all ${records.length} files under ${body.root}.`
            : `Scanned ${records.length} files under ${body.root}.`,
      });
    }

    if (body.mode === "cancel") {
      const cancelled = requestActiveScanCancel();
      if (!cancelled) {
        return NextResponse.json({ message: "No scan is currently running." }, { status: 400 });
      }

      return NextResponse.json({ message: "Trimarr will stop after the current file finishes." });
    }

    return NextResponse.json({ message: "Unknown scan mode." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed.";
    const failedState = getActiveScanState();
    if (failedState && failedState.status === "running") {
      setActiveScanState({
        ...failedState,
        status: "failed",
        completedAt: new Date().toISOString(),
        message,
      });
    }
    writeAppLog("error", "scan", "Scan request failed", message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
