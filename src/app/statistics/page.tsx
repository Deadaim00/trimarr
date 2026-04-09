import Link from "next/link";
import { formatBytes, formatDate, formatDurationMs } from "@/lib/format";
import { getSettings, getStatisticsOverview } from "@/lib/storage";

export const dynamic = "force-dynamic";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDecimal(value: number, digits = 1): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

export default async function StatisticsPage() {
  const stats = getStatisticsOverview();
  const settings = getSettings();
  const totalQueueStates = stats.queue.queued + stats.queue.running + stats.queue.failed + stats.queue.idle + stats.queue.done;
  const totalProcessedOutcomes = stats.processing.successCount + stats.processing.warningCount;
  const processedSavingsPercent =
    stats.overview.processedPriorBytes > 0
      ? (Math.max(0, stats.processing.totalSavedBytes) / stats.overview.processedPriorBytes) * 100
      : 0;
  const mappedTracksTotal = stats.overview.subtitleTracksMapped + stats.overview.audioTracksMapped;
  const removedTracksTotal = stats.overview.subtitleTracksRemoved + stats.overview.audioTracksRemoved;
  const removalRate = mappedTracksTotal > 0 ? (removedTracksTotal / mappedTracksTotal) * 100 : 0;

  return (
    <main className="page-shell">
      <section className="section-header">
        <h1>Statistics</h1>
        <div className="panel-meta">
          <span>Last scan: {formatDate(stats.overview.lastScanAt)}</span>
          <span>{formatCount(stats.scanPerformance.totalRuns)} scan runs</span>
          <span>{formatCount(stats.overview.processedFiles)} processed files</span>
        </div>
      </section>

      <section className="panel statistics-hero">
        <div className="statistics-hero-copy">
          <span className="statistics-kicker">Analytics</span>
          <h2>Processing performance and storage impact</h2>
          <p>
            Trimarr has removed {formatCount(removedTracksTotal)} tracks across {formatCount(stats.overview.processedFiles)} processed files,
            saving {formatBytes(Math.max(0, stats.processing.totalSavedBytes))} so far.
          </p>
        </div>
        <div className="statistics-hero-metrics">
          <div className="statistics-hero-metric">
            <span>Removal rate</span>
            <strong>{formatDecimal(removalRate, 1)}%</strong>
          </div>
          <div className="statistics-hero-metric">
            <span>Processed savings</span>
            <strong>{formatDecimal(processedSavingsPercent, 1)}%</strong>
          </div>
          <div className="statistics-hero-metric">
            <span>Largest save</span>
            <strong>{formatBytes(stats.processing.largestSavedBytes)}</strong>
          </div>
        </div>
      </section>

      <section className="stats-row stats-row-top">
        <article className="stat-card">
          <span className="stat-label">Files Inspected</span>
          <strong>{formatCount(stats.overview.filesInspected)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Subtitle / Audio Mapped</span>
          <strong>
            {formatCount(stats.overview.subtitleTracksMapped)} / {formatCount(stats.overview.audioTracksMapped)}
          </strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Subs Removed</span>
          <strong>{formatCount(stats.overview.subtitleTracksRemoved)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Audio Removed</span>
          <strong>{formatCount(stats.overview.audioTracksRemoved)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Schedule</span>
          <strong>
            {settings.scheduleEnabled
              ? `${settings.scheduleRunAt}-${settings.scheduleEndAt} (${settings.scheduleTimeZone === "server-local" ? "Server local" : settings.scheduleTimeZone})`
              : "Disabled"}
          </strong>
        </article>
      </section>

      <section className="stats-row">
        <article className="stat-card">
          <span className="stat-label">Unprocessed Files</span>
          <strong>{formatCount(stats.overview.unprocessedFiles)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Processed Files</span>
          <strong>{formatCount(stats.overview.processedFiles)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Processed Prior Size</span>
          <strong>{formatBytes(stats.overview.processedPriorBytes)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Processed Current Size</span>
          <strong>{formatBytes(stats.overview.processedCurrentBytes)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Storage Saved</span>
          <strong>{formatBytes(Math.max(0, stats.processing.totalSavedBytes))}</strong>
        </article>
      </section>

      <section className="stats-row">
        <article className="stat-card">
          <span className="stat-label">Queue Queued</span>
          <strong>{formatCount(stats.queue.queued)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Queue Running</span>
          <strong>{formatCount(stats.queue.running)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Queue Failed</span>
          <strong>{formatCount(stats.queue.failed)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Completed w/ Warnings</span>
          <strong>{formatCount(stats.processing.warningCount)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Trash Copies</span>
          <strong>{formatCount(stats.processing.trashCount)}</strong>
        </article>
      </section>

      <section className="stats-grid-two">
        <section className="panel">
          <div className="panel-header">
            <h2>Queue Mix</h2>
          </div>
          <div className="statistics-bar-list">
            {[
              { label: "Queued", value: stats.queue.queued, tone: "blue" },
              { label: "Running", value: stats.queue.running, tone: "warn" },
              { label: "Failed", value: stats.queue.failed, tone: "danger" },
              { label: "Completed", value: stats.queue.done, tone: "safe" },
            ].map((item) => {
              const width = totalQueueStates > 0 ? (item.value / totalQueueStates) * 100 : 0;
              return (
                <div key={item.label} className="statistics-bar-row">
                  <div className="statistics-bar-meta">
                    <span>{item.label}</span>
                    <strong>{formatCount(item.value)}</strong>
                  </div>
                  <div className="statistics-bar-track">
                    <div className={`statistics-bar-fill statistics-bar-fill-${item.tone}`} style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Outcome Mix</h2>
          </div>
          <div className="statistics-bar-list">
            {[
              { label: "Success", value: stats.processing.successCount, tone: "safe" },
              { label: "Warnings", value: stats.processing.warningCount, tone: "warn" },
            ].map((item) => {
              const width = totalProcessedOutcomes > 0 ? (item.value / totalProcessedOutcomes) * 100 : 0;
              return (
                <div key={item.label} className="statistics-bar-row">
                  <div className="statistics-bar-meta">
                    <span>{item.label}</span>
                    <strong>{formatCount(item.value)}</strong>
                  </div>
                  <div className="statistics-bar-track">
                    <div className={`statistics-bar-fill statistics-bar-fill-${item.tone}`} style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="statistics-summary-callout">
              <span>Average saved per processed file</span>
              <strong>{formatBytes(stats.processing.averageSavedBytes)}</strong>
            </div>
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Processing Analytics</h2>
        </div>
        <div className="stat-grid">
          <article className="stat-card">
            <span className="stat-label">Successful Files</span>
            <strong>{formatCount(stats.processing.successCount)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Average Saved / File</span>
            <strong>{formatBytes(stats.processing.averageSavedBytes)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Largest Single Save</span>
            <strong>{formatBytes(stats.processing.largestSavedBytes)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Plans Tracked</span>
            <strong>{formatCount(stats.overview.plannedFiles)}</strong>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Scan Performance</h2>
        </div>
        <div className="stat-grid">
          <article className="stat-card">
            <span className="stat-label">Total Scan Runs</span>
            <strong>{formatCount(stats.scanPerformance.totalRuns)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Files / Run</span>
            <strong>{formatDecimal(stats.scanPerformance.averageFilesPerRun)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Subs / Run</span>
            <strong>{formatDecimal(stats.scanPerformance.averageSubtitleTracksPerRun)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Audio / Run</span>
            <strong>{formatDecimal(stats.scanPerformance.averageAudioTracksPerRun)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Average Duration</span>
            <strong>{formatDurationMs(stats.scanPerformance.averageDurationMs)}</strong>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Library Breakdown</h2>
        </div>
        {stats.categoryBreakdown.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No files have been scanned yet.</strong>
              <p>Run a scan and Trimarr will start building category analytics here.</p>
            </div>
          </div>
        ) : (
          <div className="run-table">
            <div className="run-table-header statistics-category-header">
              <span>Type</span>
              <span>Files</span>
              <span>Processed</span>
              <span>Unprocessed</span>
              <span>Subs Removed</span>
              <span>Audio Removed</span>
              <span>Saved</span>
            </div>
            {stats.categoryBreakdown.map((row) => (
              <div key={row.category} className="run-row statistics-category-row">
                <span className="run-target">{row.category === "movie" ? "Movies" : "TV"}</span>
                <span>{formatCount(row.files)}</span>
                <span>{formatCount(row.processedFiles)}</span>
                <span>{formatCount(row.unprocessedFiles)}</span>
                <span className="metric-remove">{formatCount(row.subtitleTracksRemoved)}</span>
                <span className="metric-remove">{formatCount(row.audioTracksRemoved)}</span>
                <span>{formatBytes(Math.max(0, row.processedPriorBytes - row.processedCurrentBytes))}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {stats.categoryBreakdown.length > 0 ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Category Savings</h2>
          </div>
          <div className="statistics-category-cards">
            {stats.categoryBreakdown.map((row) => {
              const savedBytes = Math.max(0, row.processedPriorBytes - row.processedCurrentBytes);
              const savedPercent = row.processedPriorBytes > 0 ? (savedBytes / row.processedPriorBytes) * 100 : 0;
              return (
                <article key={row.category} className="statistics-category-card">
                  <div className="statistics-category-card-header">
                    <strong>{row.category === "movie" ? "Movies" : "TV"}</strong>
                    <span>{formatCount(row.files)} files</span>
                  </div>
                  <div className="statistics-bar-track">
                    <div className="statistics-bar-fill statistics-bar-fill-blue" style={{ width: `${savedPercent}%` }} />
                  </div>
                  <div className="statistics-category-card-meta">
                    <span>Saved</span>
                    <strong>{formatBytes(savedBytes)}</strong>
                  </div>
                  <div className="statistics-category-card-meta">
                    <span>Track removals</span>
                    <strong>
                      {formatCount(row.subtitleTracksRemoved)} subs / {formatCount(row.audioTracksRemoved)} audio
                    </strong>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <h2>Top Storage Savings</h2>
        </div>
        {stats.topSavings.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No processed files yet.</strong>
              <p>Once Trimarr processes files, the biggest storage wins will show up here.</p>
            </div>
          </div>
        ) : (
          <div className="run-table">
            <div className="run-table-header statistics-savings-header statistics-savings-header-wide">
              <span>File</span>
              <span>Saved</span>
              <span>Before</span>
              <span>After</span>
              <span>Outcome</span>
              <span>Processed</span>
            </div>
            {stats.topSavings.map((file) => (
              <div key={file.mediaFileId} className="run-row statistics-savings-row statistics-savings-row-wide">
                <Link href={`/files/${file.mediaFileId}`} className="run-target inline-link" title={file.path}>
                  {file.path.split("/").at(-1)}
                </Link>
                <span className="metric-keep">{formatBytes(file.savedBytes)}</span>
                <span>{formatBytes(file.sizeBeforeBytes)}</span>
                <span>{formatBytes(file.sizeAfterBytes)}</span>
                <span className={`queue-status ${file.processedWithWarnings ? "queue-status-warn" : "queue-status-done"}`}>
                  {file.processedWithWarnings ? "Warnings" : "Success"}
                </span>
                <span>{formatDate(file.processedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Recent Failures</h2>
        </div>
        {stats.recentFailures.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No recent failures.</strong>
              <p>That’s the state we want. New processing failures will show up here for quick review.</p>
            </div>
          </div>
        ) : (
          <div className="run-table">
            <div className="run-table-header statistics-failure-header statistics-failure-header-wide">
              <span>File</span>
              <span>Failed</span>
              <span>Event</span>
            </div>
            {stats.recentFailures.map((failure) => (
              <div key={`${failure.mediaFileId}-${failure.createdAt}`} className="run-row statistics-failure-row statistics-failure-row-wide">
                <Link href={`/files/${failure.mediaFileId}`} className="run-target inline-link" title={failure.path}>
                  {failure.path.split("/").at(-1)}
                </Link>
                <span>{formatDate(failure.createdAt)}</span>
                <span className="statistics-failure-message" title={failure.message}>
                  {failure.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
