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

function zonedDate(timeZone: string, date: Date): Date {
  return new Date(date.toLocaleString("en-US", { timeZone }));
}

function dateAtTime(date: Date, timeKey: string): Date {
  const [hour, minute] = timeKey.split(":").map((value) => Number(value));
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next;
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

export function hasReachedConfiguredSchedulerEndSince(
  settings: TrimarrSettings,
  startedAt: string | null,
  date = new Date(),
): boolean {
  if (!settings.scheduleEnabled || !startedAt || settings.scheduleRunAt === settings.scheduleEndAt) {
    return false;
  }

  const timeZone = resolveSchedulerTimeZone(settings.scheduleTimeZone);
  const started = zonedDate(timeZone, new Date(startedAt));
  const now = zonedDate(timeZone, date);
  const todayEnd = dateAtTime(now, settings.scheduleEndAt);
  const yesterdayEnd = new Date(todayEnd);
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

  return (started < todayEnd && todayEnd <= now) || (started < yesterdayEnd && yesterdayEnd <= now);
}
