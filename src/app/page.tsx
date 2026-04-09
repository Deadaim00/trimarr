import Link from "next/link";
import { Film, FolderSearch, Languages, ListChecks, MinusCircle } from "lucide-react";
import { FilesTable } from "@/components/files-table";
import { ScanControls } from "@/components/scan-controls";
import { formatBytes, formatDate, formatDurationMs } from "@/lib/format";
import { getDashboardStats, getRecentFiles, getSettings, listRecentPlans, listRecentScanRuns } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const stats = getDashboardStats();
  const recentFiles = getRecentFiles(12);
  const settings = getSettings();
  const recentScanRuns = listRecentScanRuns(8);
  const recentPlans = listRecentPlans(8, "unprocessed");
  const storageSavedBytes = Math.max(0, stats.processedPriorBytes - stats.processedCurrentBytes);

  return (
    <main className="page-shell">
      <section className="section-header">
        <h1>Dashboard</h1>
        <div className="panel-meta">
          <span>Last scan: {formatDate(stats.lastScanAt)}</span>
          <span>Total data scanned: {formatBytes(stats.totalBytes)}</span>
          <span>Total data current: {formatBytes(stats.currentTotalBytes)}</span>
        </div>
      </section>

      <section className="stats-row stats-row-top">
        <article className="stat-card">
          <span className="stat-icon">
            <Film size={18} />
          </span>
          <span className="stat-label">Files inspected</span>
          <strong>{stats.filesInspected}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-icon">
            <Languages size={18} />
          </span>
          <span className="stat-label">Subtitle / audio mapped</span>
          <strong>
            {stats.subtitleTracksMapped} / {stats.audioTracksMapped}
          </strong>
        </article>
        <article className="stat-card">
          <span className="stat-icon">
            <ListChecks size={18} />
          </span>
          <span className="stat-label">Subs removed</span>
          <strong>{stats.subtitleTracksRemoved}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-icon">
            <MinusCircle size={18} />
          </span>
          <span className="stat-label">Audio removed</span>
          <strong>{stats.audioTracksRemoved}</strong>
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
          <span className="stat-label">Unprocessed files</span>
          <strong>{stats.unprocessedFiles}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Processed files</span>
          <strong>{stats.processedFiles}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Processed prior size</span>
          <strong>{formatBytes(stats.processedPriorBytes)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Processed current size</span>
          <strong>{formatBytes(stats.processedCurrentBytes)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Storage saved</span>
          <strong>{formatBytes(storageSavedBytes)}</strong>
        </article>
      </section>

      <ScanControls roots={settings.scanRoots} scanLimit={settings.scanLimit} />

      <section className="panel">
        <div className="panel-header">
          <h2>Recent Scan Runs</h2>
        </div>

        {recentScanRuns.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No scan runs recorded yet.</strong>
              <p>Trimarr will keep a history here as soon as you inspect a file or scan a root.</p>
            </div>
          </div>
        ) : (
          <div className="run-table">
            <div className="run-table-header scan-runs-header">
              <span>Mode</span>
              <span>Target</span>
              <span>Files</span>
              <span>Subs</span>
              <span>Audio</span>
              <span>Duration</span>
              <span>Completed</span>
            </div>
            {recentScanRuns.map((run) => (
              <div key={run.id} className="run-row scan-runs-row">
                <span className="run-mode">{run.mode}</span>
                <span className="run-target" title={run.target}>
                  {run.target}
                </span>
                <span>{run.filesScanned}</span>
                <span>{run.subtitleTracksMapped}</span>
                <span>{run.audioTracksMapped}</span>
                <span>{formatDurationMs(run.durationMs)}</span>
                <span>{formatDate(run.completedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Planned Queue</h2>
          <div className="panel-meta">
            <span>{settings.scheduleProcessUnprocessedOnly ? "Showing unprocessed plan records" : "Showing recent plan records"}</span>
          </div>
        </div>

        {recentPlans.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No file plans recorded yet.</strong>
              <p>Each scan now creates a stored planning snapshot for the files it inspects.</p>
            </div>
          </div>
        ) : (
          <div className="run-table">
            <div className="run-table-header dashboard-plan-table-header">
              <span>File</span>
              <span>Subs</span>
              <span>Keep Subs</span>
              <span>Audio</span>
              <span>Keep Audio</span>
              <span>Remove</span>
              <span>Status</span>
            </div>
            {recentPlans.map((plan) => (
              <div key={plan.mediaFileId} className="run-row dashboard-plan-row">
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
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Recent Files</h2>
          <div className="panel-meta">
            <Link href="/files" className="inline-link">
              View All
            </Link>
          </div>
        </div>

        {recentFiles.length === 0 ? (
          <div className="empty-state">
            <FolderSearch size={22} />
            <div>
              <strong>No files inspected yet.</strong>
              <p>Run a root scan or inspect a single file to start building Trimarr&apos;s inventory.</p>
            </div>
          </div>
        ) : (
          <FilesTable files={recentFiles} emptyMessage="Run a scan to populate the recent file view." />
        )}
      </section>
    </main>
  );
}
