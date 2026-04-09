import { NextResponse } from "next/server";
import { emptyTrash } from "@/lib/process";
import { writeAppLog } from "@/lib/storage";

export async function POST() {
  try {
    const removed = await emptyTrash();
    return NextResponse.json({ message: `Removed ${removed} trash file${removed === 1 ? "" : "s"}.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to empty trash.";
    writeAppLog("error", "system", "Empty trash failed", message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
