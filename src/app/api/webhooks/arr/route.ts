import { NextResponse } from "next/server";
import { inspectMediaFile } from "@/lib/scan";
import { getQueueBatchState, hasRunningPlans, upsertFiles, writeAppLog, getSettings } from "@/lib/storage";
import { startQueueBatch } from "@/lib/queue-batch";

function extractCandidatePaths(value: unknown, results: Set<string>): void {
  if (!value) {
    return;
  }

  if (typeof value === "string") {
    if (value.startsWith("/")) {
      results.add(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractCandidatePaths(item, results);
    }
    return;
  }

  if (typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      extractCandidatePaths(entry, results);
    }
  }
}

function filterMediaPaths(paths: Iterable<string>, prefix: string): string[] {
  return Array.from(paths).filter((path) => path.startsWith(prefix) && path.toLowerCase().endsWith(".mkv"));
}

export async function POST(request: Request) {
  try {
    const settings = getSettings();
    if (!settings.webhookEnabled) {
      writeAppLog("warn", "webhook", "Rejected Arr webhook", "Webhooks are disabled in settings.");
      return NextResponse.json({ message: "Webhooks are disabled." }, { status: 403 });
    }

    if (!settings.webhookToken.trim()) {
      writeAppLog("warn", "webhook", "Rejected Arr webhook", "Webhooks are enabled but no API key is configured.");
      return NextResponse.json({ message: "Webhook API key is not configured." }, { status: 503 });
    }

    const headerToken =
      request.headers.get("x-api-key")?.trim() ??
      request.headers.get("x-trimarr-token")?.trim() ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
      "";
    const authToken = new URL(request.url).searchParams.get("token")?.trim() ?? headerToken;

    if (settings.webhookToken && authToken !== settings.webhookToken) {
      writeAppLog("warn", "webhook", "Rejected Arr webhook", "Webhook API key did not match the configured token.");
      return NextResponse.json({ message: "Invalid webhook API key." }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const eventType = typeof body.eventType === "string" ? body.eventType : "unknown";

    if (eventType.toLowerCase() === "test") {
      writeAppLog("info", "webhook", "Arr webhook test received", null);
      return NextResponse.json({ message: "Trimarr webhook test received." });
    }

    const candidates = new Set<string>();
    extractCandidatePaths(body, candidates);
    const mediaPaths = filterMediaPaths(candidates, settings.libraryPathPrefix);

    if (mediaPaths.length === 0) {
      writeAppLog("info", "webhook", "Arr webhook received no supported media paths", JSON.stringify({ eventType }));
      return NextResponse.json({ message: "No supported MKV paths found in webhook payload." });
    }

    const records = [];
    for (const path of mediaPaths) {
      try {
        records.push(await inspectMediaFile(path));
      } catch (error) {
        writeAppLog(
          "warn",
          "webhook",
          `Failed to inspect webhook file ${path}`,
          error instanceof Error ? error.message : "Unknown webhook inspection error.",
        );
      }
    }

    if (records.length > 0) {
      upsertFiles(records);
    }

    const queueState = getQueueBatchState();
    const startedAutoProcess =
      records.length > 0 &&
      settings.webhookAutoProcessWhenIdle &&
      queueState.status === "idle" &&
      !hasRunningPlans() &&
      startQueueBatch("webhook");

    writeAppLog(
      "info",
      "webhook",
      "Arr webhook queued files",
      JSON.stringify({
        eventType,
        queued: records.length,
        autoProcessStarted: startedAutoProcess,
        paths: records.map((record) => record.path),
      }),
    );

    return NextResponse.json({
      message: startedAutoProcess
        ? `Queued ${records.length} file${records.length === 1 ? "" : "s"} from webhook and started processing.`
        : `Queued ${records.length} file${records.length === 1 ? "" : "s"} from webhook.`,
      queued: records.length,
      processingStarted: startedAutoProcess,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    writeAppLog("error", "webhook", "Arr webhook processing failed", message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
