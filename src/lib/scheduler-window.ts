import { SERVER_LOCAL_TIMEZONE } from "@/lib/config";
import type { TrimarrSettings } from "@/lib/types";

function detectedServerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || "UTC";
}

export function resolveSchedulerTimeZone(configured: string): string {
  return configured === SERVER_LOCAL_TIMEZONE ? detectedServerTimeZone() : configured;
}

function timeKeyInZone(timeZone: string, date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.get("hour") ?? "00"}:${parts.get("minute") ?? "00"}`;
}

export function isWithinSchedulerWindow(runAt: string, endAt: string, timeZone: string, date = new Date()): boolean {
  const now = timeKeyInZone(timeZone, date);
  if (runAt === endAt) {
    return true;
  }

  if (runAt < endAt) {
    return now >= runAt && now < endAt;
  }

  return now >= runAt || now < endAt;
}

export function isWithinConfiguredSchedulerWindow(settings: TrimarrSettings, date = new Date()): boolean {
  const timeZone = resolveSchedulerTimeZone(settings.scheduleTimeZone);
  return isWithinSchedulerWindow(settings.scheduleRunAt, settings.scheduleEndAt, timeZone, date);
}
