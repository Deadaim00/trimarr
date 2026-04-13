import { NextResponse } from "next/server";
import {
  addFileHistoryEntry,
  countRunningPlans,
  getFailedQueueCount,
  getQueueBatchState,
  getFilePlanById,
  getNextQueuedMediaFileId,
  getSettings,
  listFailedPlans,
  resetPlansToQueued,
  skipFilePlan,
  tryStartProcessing,
  unskipFilePlan,
  writeAppLog,
} from "@/lib/storage";
import { processFilePlan } from "@/lib/process";
import { requestQueueBatchStop, startQueueBatch } from "@/lib/queue-batch";

type ProcessBody = {
  mediaFileId?: string;
  mode?: "file" | "next" | "retry_failed_all" | "process_all" | "cancel_all" | "skip" | "unskip";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ProcessBody;
    if (body.mode === "process_all") {
      const queueState = getQueueBatchState();
      if (queueState.status === "running" || queueState.status === "stopping") {
        return NextResponse.json({ message: "Queue processing is already active." }, { status: 409 });
      }

      if (!getNextQueuedMediaFileId()) {
        return NextResponse.json({ message: "No queued files are ready to process." }, { status: 400 });
      }

      startQueueBatch("manual");
      return NextResponse.json({ message: "Queue processing started." });
    }

    if (body.mode === "cancel_all") {
      const queueState = getQueueBatchState();
      if (queueState.status !== "running") {
        return NextResponse.json({ message: "Queue processing is not running." }, { status: 400 });
      }

      requestQueueBatchStop();
      return NextResponse.json({ message: "Trimarr will stop after the current file finishes." });
    }

    if (body.mode === "retry_failed_all") {
      const failedPlans = listFailedPlans(1000);
      if (failedPlans.length === 0) {
        return NextResponse.json({ message: "No failed files are waiting for retry." });
      }

      const resetCount = resetPlansToQueued(
        failedPlans.map((plan) => plan.mediaFileId),
        "Queued for retry",
      );

      for (const plan of failedPlans) {
        addFileHistoryEntry(plan.mediaFileId, "queued", "Queued for retry", {
          details: "Started from retry all failed action.",
        });
      }

      writeAppLog("info", "queue", `Queued ${resetCount} failed files for retry`, null);

      return NextResponse.json({
        message:
          getFailedQueueCount() > 0
            ? `Queued ${resetCount} failed files for retry.`
            : `Queued ${resetCount} failed files for retry.`,
      });
    }

    const mediaFileId = body.mode === "next" ? getNextQueuedMediaFileId() : body.mediaFileId;

    if (!mediaFileId) {
      return NextResponse.json({ message: "A file id is required." }, { status: 400 });
    }

    const plan = getFilePlanById(mediaFileId);
    if (!plan) {
      return NextResponse.json({ message: "File plan not found." }, { status: 404 });
    }

    if (body.mode === "skip") {
      if (!skipFilePlan(mediaFileId, "Skipped by user")) {
        return NextResponse.json({ message: "This file cannot be skipped right now." }, { status: 409 });
      }

      addFileHistoryEntry(mediaFileId, "skipped", "Skipped from queue", {
        details: "User marked this file as skipped. It will not be processed unless unskipped or manually processed.",
      });
      writeAppLog("info", "queue", `Skipped ${plan.path}`, "User marked the file as skipped.");
      return NextResponse.json({ message: "File skipped." });
    }

    if (body.mode === "unskip") {
      if (!unskipFilePlan(mediaFileId, "Queued after skip was removed")) {
        return NextResponse.json({ message: "This file is not skipped or cannot be queued." }, { status: 409 });
      }

      addFileHistoryEntry(mediaFileId, "queued", "Removed skip and queued file", {
        details: "User removed the skip marker.",
      });
      writeAppLog("info", "queue", `Unskipped ${plan.path}`, "User returned the file to the queue.");
      return NextResponse.json({ message: "File returned to queue." });
    }

    if (plan.processingState === "running") {
      return NextResponse.json({ message: "This file is already processing." }, { status: 409 });
    }

    const settings = getSettings();
    const maxConcurrentJobs = Math.min(4, Math.max(1, settings.maxConcurrentJobs || 1));
    if (countRunningPlans() >= maxConcurrentJobs) {
      return NextResponse.json(
        { message: `The concurrency limit has been reached (${maxConcurrentJobs} active processor${maxConcurrentJobs === 1 ? "" : "s"}).` },
        { status: 409 },
      );
    }

    if (!tryStartProcessing(mediaFileId, "Preparing remux", maxConcurrentJobs)) {
      return NextResponse.json(
        { message: "This file is already processing, no longer eligible, or the concurrency limit was reached." },
        { status: 409 },
      );
    }

    writeAppLog("info", "queue", `Queued processing for ${plan.path}`, null);
    addFileHistoryEntry(mediaFileId, "queued", "Queued for processing", {
      details: body.mode === "next" ? "Started from queue action." : "Started from file detail action.",
    });

    void processFilePlan(mediaFileId).catch(() => {
      // processing state is persisted to SQLite inside the worker path
    });

    return NextResponse.json({ message: "Processing started." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start processing.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
