import { NextResponse } from "next/server";
import { runSchedulerTick } from "@/lib/scheduler";
import { writeAppLog } from "@/lib/storage";

function isAuthorized(request: Request): boolean {
  const expected = process.env.TRIMARR_SCHEDULER_TOKEN;
  if (!expected) {
    return false;
  }

  return request.headers.get("x-trimarr-scheduler-token") === expected;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    writeAppLog("warn", "scheduler", "Rejected unauthorized scheduler tick", null);
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runSchedulerTick();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled run failed.";
    writeAppLog("error", "scheduler", "Scheduled run failed", message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
