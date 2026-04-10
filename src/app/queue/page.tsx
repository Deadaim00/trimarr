import Link from "next/link";
import { QueueActions } from "@/components/queue-actions";
import { QueueAutoRefresh } from "@/components/queue-auto-refresh";
import { QueueBatchActions } from "@/components/queue-batch-actions";
import { QueueFilters } from "@/components/queue-filters";
import { FilesPagination } from "@/components/files-pagination";
import { countQueuedPlans, getQueueBatchState, getSettings, listQueuedPlansPage } from "@/lib/storage";
import { SERVER_LOCAL_TIMEZONE } from "@/lib/config";

export const dynamic = "force-dynamic";

function detectedServerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || "UTC";
}

function resolveSchedulerTimeZone(configured: string): string {
  return configured === SERVER_LOCAL_TIMEZONE ? detectedServerTimeZone() : configured;
}

function zonedNow(timeZone: string): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone }));
}

function nextScheduledRunLabel(runAt: string, timeZone: string): string {
  const now = zonedNow(timeZone);
  const [runHour, runMinute] = runAt.split(":").map((value) => Number(value));
  const target = new Date(now);
  target.setSeconds(0, 0);
  target.setHours(runHour, runMinute, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(target);
}

function batchSourceLabel(source: "manual" | "scheduler" | "webhook"): string {
  if (source === "scheduler") {
    return "Scheduler";
  }

  if (source === "webhook") {
    return "Webhook";
  }

  return "Manual";
}

type QueuePageProps = {
  searchParams: Promise<{
    q?: string;
    status?: "all" | "queued" | "running" | "failed" | "idle";
    result?: "all" | "matched" | "no_keep";
    category?: "all" | "movie" | "tv";
    page?: string;
  }>;
};

export default async function QueuePage({ searchParams }: QueuePageProps) {
  const params = await searchParams;
  const filters = {
    query: params.q,
    status: params.status ?? "all",
    result: params.result ?? "all",
    category: params.category ?? "all",
  } as const;
  const pageSize = 50;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const totalQueued = countQueuedPlans(filters);
  const totalPages = Math.max(1, Math.ceil(totalQueued / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const queuedPlans = listQueuedPlansPage(filters, pageSize, (safePage - 1) * pageSize);
  const batchState = getQueueBatchState();
  const settings = getSettings();
  const scheduleTimeZone = resolveSchedulerTimeZone(settings.scheduleTimeZone);
  const nextScheduleLabel = settings.scheduleEnabled
    ? nextScheduledRunLabel(settings.scheduleRunAt, scheduleTimeZone)
    : "Scheduler off";
  const isRunning = queuedPlans.some((plan) => plan.processingState === "running") || batchState.status === "running" || batchState.status === "stopping";
  const failedCount = countQueuedPlans({ ...filters, status: "failed" });

  return (
    <main className="page-shell">
      <section className="section-header">
        <h1>Processing Queue</h1>
        <div className="panel-meta">
          <span>
            {totalQueued} queued files
            {totalPages > 1 ? ` • page ${safePage} of ${totalPages}` : ""}
          </span>
          <span>{`Next scheduled process: ${nextScheduleLabel}`}</span>
          {batchState.status !== "idle" ? <span className="run-mode">{`Source: ${batchSourceLabel(batchState.source)}`}</span> : null}
          {batchState.status !== "idle" ? <span>{batchState.message}</span> : null}
        </div>
      </section>

      <section className="panel">
        <QueueFilters
          query={params.q ?? ""}
          status={params.status ?? "all"}
          result={params.result ?? "all"}
          category={params.category ?? "all"}
        />
        {failedCount > 0 ? (
          <div className="queue-failure-banner">
            Failed items stay out of automatic processing until you manually retry them or rescan the file.
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <QueueAutoRefresh active={isRunning} />
          <QueueBatchActions failedCount={failedCount} batchState={batchState} />
        </div>
        {queuedPlans.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No files are queued right now.</strong>
              <p>Run a scan to create file plans, and Trimarr will place unprocessed items here.</p>
            </div>
          </div>
        ) : (
          <div className="run-table">
            <div className="run-table-header queue-table-header">
              <span>File</span>
              <span>Subs</span>
              <span>Keep Subs</span>
              <span>Audio</span>
              <span>Keep Audio</span>
              <span>Remove</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            {queuedPlans.map((plan) => (
              <div key={plan.mediaFileId} className="run-row queue-row">
                <Link href={`/files/${plan.mediaFileId}`} className="run-target inline-link" title={plan.path}>
                  {plan.path.split("/").at(-1)}
                </Link>
                <span>{plan.subtitleTrackCount}</span>
                <span className="metric-keep">{plan.subtitleKeepCount}</span>
                <span>{plan.audioTrackCount}</span>
                <span className="metric-keep">{plan.audioKeepCount}</span>
                <span className="metric-remove">{plan.removeCount}</span>
                <span className={`queue-status queue-status-${plan.processingState}`}>
                  {plan.processingState === "running"
                    ? `running ${plan.progressPercent ?? 0}%`
                    : plan.processingState === "failed"
                      ? "failed"
                      : plan.processingState}
                </span>
                <QueueActions mediaFileId={plan.mediaFileId} processingState={plan.processingState} />
              </div>
            ))}
          </div>
        )}
        <FilesPagination page={safePage} totalPages={totalPages} />
      </section>
    </main>
  );
}
