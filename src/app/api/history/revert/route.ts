import { NextResponse } from "next/server";
import { revertProcessedFile } from "@/lib/process";
import { getActiveTrashItem, writeAppLog } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { mediaFileId?: string };
    if (!body.mediaFileId) {
      return NextResponse.json({ message: "A file id is required." }, { status: 400 });
    }

    const trashItem = getActiveTrashItem(body.mediaFileId);
    if (!trashItem) {
      return NextResponse.json({ message: "No trash file is available for revert." }, { status: 404 });
    }

    await revertProcessedFile(body.mediaFileId);
    return NextResponse.json({ message: "Original file restored from trash." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Revert failed.";
    writeAppLog("error", "process", "Revert failed", message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
