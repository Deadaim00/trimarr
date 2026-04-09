import { stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { inspectMediaFile, listRootMediaFiles } from "@/lib/scan";
import { getSettings, upsertFiles, writeAppLog } from "@/lib/storage";

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

async function expandMediaPaths(paths: Iterable<string>, prefix: string): Promise<string[]> {
  const expanded = new Set<string>();

  for (const candidate of paths) {
    if (!candidate.startsWith(prefix)) {
      continue;
    }

    try {
      const candidateStats = await stat(candidate);
      if (candidateStats.isDirectory()) {
        const nested = await listRootMediaFiles(candidate, null);
        for (const path of nested) {
          if (path.startsWith(prefix)) {
            expanded.add(path);
          }
        }
        continue;
      }

      if (candidateStats.isFile() && candidate.toLowerCase().endsWith(".mkv")) {
        expanded.add(candidate);
      }
    } catch {
      // Ignore missing or unreadable paths from SAB payloads.
    }
  }

  return Array.from(expanded);
}

function extractAuthToken(request: Request): string {
  const headerToken =
    request.headers.get("x-api-key")?.trim() ??
    request.headers.get("x-trimarr-token")?.trim() ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    "";

  return new URL(request.url).searchParams.get("token")?.trim() ?? headerToken;
}

export async function POST(request: Request) {
  try {
    const settings = getSettings();
    if (!settings.webhookEnabled) {
      writeAppLog("warn", "webhook", "Rejected SAB webhook", "Webhooks are disabled in settings.");
      return NextResponse.json({ message: "Webhooks are disabled." }, { status: 403 });
    }

    if (!settings.webhookToken.trim()) {
      writeAppLog("warn", "webhook", "Rejected SAB webhook", "Webhooks are enabled but no API key is configured.");
      return NextResponse.json({ message: "Webhook API key is not configured." }, { status: 503 });
    }

    const authToken = extractAuthToken(request);
    if (settings.webhookToken && authToken !== settings.webhookToken) {
      writeAppLog("warn", "webhook", "Rejected SAB webhook", "Webhook API key did not match the configured token.");
      return NextResponse.json({ message: "Invalid webhook API key." }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const candidates = new Set<string>();
    extractCandidatePaths(body, candidates);
    const mediaPaths = await expandMediaPaths(candidates, settings.libraryPathPrefix);

    if (mediaPaths.length === 0) {
      writeAppLog(
        "info",
        "webhook",
        "SAB webhook received no supported media paths",
        JSON.stringify({
          completeDir: body.completeDir ?? null,
          finalName: body.finalName ?? null,
          category: body.category ?? null,
        }),
      );
      return NextResponse.json({ message: "No supported MKV paths found in SAB payload." });
    }

    const records = [];
    for (const path of mediaPaths) {
      try {
        records.push(await inspectMediaFile(path));
      } catch (error) {
        writeAppLog(
          "warn",
          "webhook",
          `Failed to inspect SAB file ${path}`,
          error instanceof Error ? error.message : "Unknown SAB inspection error.",
        );
      }
    }

    if (records.length > 0) {
      upsertFiles(records);
    }

    writeAppLog(
      "info",
      "webhook",
      "SAB webhook queued files",
      JSON.stringify({
        completeDir: body.completeDir ?? null,
        finalName: body.finalName ?? null,
        category: body.category ?? null,
        queued: records.length,
        paths: records.map((record) => record.path),
      }),
    );

    return NextResponse.json({
      message: `Queued ${records.length} file${records.length === 1 ? "" : "s"} from SAB.`,
      queued: records.length,
      paths: records.map((record) => record.path),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAB webhook processing failed.";
    writeAppLog("error", "webhook", "SAB webhook processing failed", message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
