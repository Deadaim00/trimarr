import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, BadgeCheck, ShieldBan } from "lucide-react";
import { CopyPathButton } from "@/components/copy-path-button";
import { ProcessFileControls } from "@/components/process-file-controls";
import { inspectMediaFile } from "@/lib/scan";
import { getFileById, getFilePlanById, listFileHistory } from "@/lib/storage";
import { formatBytes, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function FileDetailPage({ params }: PageProps) {
  const { id } = await params;
  const storedFile = getFileById(id);
  const plan = getFilePlanById(id);
  const history = listFileHistory(id, 25);

  if (!storedFile) {
    notFound();
  }

  const file = storedFile.processedAt
    ? {
        ...(await inspectMediaFile(storedFile.path)),
        processedAt: storedFile.processedAt,
        processedWithWarnings: storedFile.processedWithWarnings,
        sizeBeforeBytes: storedFile.sizeBeforeBytes,
        sizeAfterBytes: storedFile.sizeAfterBytes,
      }
    : storedFile;

  const resultLabel =
    file.subtitleTrackCount === 0 && file.audioTrackCount === 0 ? "none" : file.result === "matched" ? "keep" : "remove";
  const statusIcon = file.processedWithWarnings ? (
      <AlertTriangle size={18} />
    ) : file.result === "matched" ? (
      <BadgeCheck size={18} />
    ) : (
      <ShieldBan size={18} />
    );
  const keepTracks = file.tracks.filter((track) => track.decision === "keep");
  const removeTracks = file.tracks.filter((track) => track.decision === "remove");
  const keepAudioTracks = file.audioTracks.filter((track) => track.decision === "keep");
  const removeAudioTracks = file.audioTracks.filter((track) => track.decision === "remove");
  const currentSize = file.sizeAfterBytes ?? file.fileSizeBytes;
  const beforeSize = file.sizeBeforeBytes;
  const afterSize = file.sizeAfterBytes;

  return (
    <main className="page-shell detail-shell">
      <div className="section-header section-header-stack">
        <Link href="/" className="back-link">
          <ArrowLeft size={16} />
          Dashboard
        </Link>
        <h1>{file.path.split("/").at(-1)}</h1>
        <div className="panel-meta">
          <span>{file.path}</span>
          <CopyPathButton path={file.path} />
        </div>
      </div>

      <section className="panel detail-summary">
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">Container</span>
            <strong>{file.container.toUpperCase()}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Current size</span>
            <strong>{formatBytes(currentSize)}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Scanned</span>
            <strong>{formatDate(file.scannedAt)}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Result</span>
            <strong
              className={`safety ${
                file.processedWithWarnings
                  ? "safety-warning"
                  : file.subtitleTrackCount === 0 && file.audioTrackCount === 0
                    ? "safety-none"
                    : `safety-${file.result}`
              }`}
            >
              {statusIcon}
              {file.processedWithWarnings ? "completed with warnings" : resultLabel}
            </strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Processed</span>
            <strong>{file.processedAt ? formatDate(file.processedAt) : "No"}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Before size</span>
            <strong>{beforeSize ? formatBytes(beforeSize) : "Not processed"}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">After size</span>
            <strong>{afterSize ? formatBytes(afterSize) : "Not processed"}</strong>
          </div>
        </div>
      </section>

      {plan ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2>Plan Snapshot</h2>
              <div className="panel-meta">
                <span>Planned: {formatDate(plan.plannedAt)}</span>
                <span>Last scanned: {formatDate(plan.lastScannedAt)}</span>
              </div>
            </div>

            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-label">Keep</span>
                <strong className="metric-keep">{plan.keepCount}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Remove</span>
                <strong className="metric-remove">{plan.removeCount}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Subtitle tracks</span>
                <strong>{plan.subtitleTrackCount}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Audio tracks</span>
                <strong>{plan.audioTrackCount}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Subtitle keep / remove</span>
                <strong>
                  {plan.subtitleKeepCount} / {plan.subtitleRemoveCount}
                </strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Audio keep / remove</span>
                <strong>
                  {plan.audioKeepCount} / {plan.audioRemoveCount}
                </strong>
              </div>
            </div>
          </section>

          <ProcessFileControls
            mediaFileId={file.id}
            canProcess={plan.removableTrackCount > 0}
            initialState={plan.processingState}
            initialProgress={plan.progressPercent}
            initialMessage={plan.processingMessage}
          />

          {!file.processedAt ? (
            <section className="panel">
              <div className="panel-header">
                <h2>Preview Diff</h2>
                <div className="panel-meta">
                  <span>Before and after subtitle layout based on the current keep policy.</span>
                </div>
              </div>

              <div className="preview-grid preview-grid-two">
                <section className="preview-column">
                  <h3>Keep After Processing</h3>
                  {keepTracks.length === 0 ? (
                    <p className="muted">No subtitle tracks would remain.</p>
                  ) : (
                    <div className="preview-list">
                      {keepTracks.map((track) => (
                        <div key={track.id} className="preview-item preview-item-keep">
                          <strong>
                            #{track.index} {track.language || "und"} {track.codec}
                          </strong>
                          <span>{track.title || "Untitled track"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="preview-column">
                  <h3>Remove From File</h3>
                  {removeTracks.length === 0 ? (
                    <p className="muted">No subtitle tracks would be removed.</p>
                  ) : (
                    <div className="preview-list">
                      {removeTracks.map((track) => (
                        <div key={track.id} className="preview-item preview-item-remove">
                          <strong>
                            #{track.index} {track.language || "und"} {track.codec}
                          </strong>
                          <span>{track.title || "Untitled track"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="preview-column">
                  <h3>Keep Audio After Processing</h3>
                  {keepAudioTracks.length === 0 ? (
                    <p className="muted">No audio tracks would remain.</p>
                  ) : (
                    <div className="preview-list">
                      {keepAudioTracks.map((track) => (
                        <div key={track.id} className="preview-item preview-item-keep">
                          <strong>
                            #{track.index} {track.language || "und"} {track.codec}
                          </strong>
                          <span>
                            {track.title || "Untitled track"}
                            {track.channels ? ` • ${track.channels} ch` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="preview-column">
                  <h3>Remove Audio From File</h3>
                  {removeAudioTracks.length === 0 ? (
                    <p className="muted">No audio tracks would be removed.</p>
                  ) : (
                    <div className="preview-list">
                      {removeAudioTracks.map((track) => (
                        <div key={track.id} className="preview-item preview-item-remove">
                          <strong>
                            #{track.index} {track.language || "und"} {track.codec}
                          </strong>
                          <span>
                            {track.title || "Untitled track"}
                            {track.channels ? ` • ${track.channels} ch` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <h2>Processing History</h2>
        </div>

        {history.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No processing history yet.</strong>
              <p>Trimarr will record queue, validation, completion, and failure events for this file here.</p>
            </div>
          </div>
        ) : (
          <div className="run-table">
            <div className="run-table-header history-table-header">
              <span>Time</span>
              <span>Event</span>
              <span>Message</span>
              <span>Details</span>
              <span>Sizes</span>
            </div>
            {history.map((entry) => (
              <div key={entry.id} className="run-row history-row">
                <span>{formatDate(entry.createdAt)}</span>
                <span className={`queue-status queue-status-${entry.eventType === "failed" ? "failed" : entry.eventType === "completed" ? "done" : entry.eventType === "validated" ? "running" : "idle"}`}>
                  {entry.eventType}
                </span>
                <span>{entry.message}</span>
                <span className="log-details" title={entry.details ?? ""}>
                  {entry.details ?? "None"}
                </span>
                <span>
                  {entry.sizeBeforeBytes ? formatBytes(entry.sizeBeforeBytes) : "?"}
                  {" -> "}
                  {entry.sizeAfterBytes ? formatBytes(entry.sizeAfterBytes) : "?"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Subtitle Tracks</h2>
        </div>

        <div className="track-list">
          {file.tracks.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <div>
                <strong>None</strong>
                <p>This file does not currently have any embedded subtitle tracks.</p>
              </div>
            </div>
          ) : (
            file.tracks.map((track) => (
              <article key={track.id} className={`track-card decision-${track.decision}`}>
                <div className="track-main">
                  <div className="track-heading">
                    <strong>
                      #{track.index} {track.language || "und"} {track.codec}
                    </strong>
                    <span className={`decision-badge decision-${track.decision}`}>{track.decision}</span>
                  </div>
                  <p className="track-title">{track.title || "Untitled track"}</p>
                  <p className="track-reason">{track.reason}</p>
                </div>
                <div className="track-flags">
                  <span>forced: {track.forced ? "yes" : "no"}</span>
                  <span>sdh: {track.hearingImpaired ? "yes" : "no"}</span>
                  <span>default: {track.default ? "yes" : "no"}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Audio Tracks</h2>
        </div>

        <div className="track-list">
          {file.audioTracks.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <div>
                <strong>None</strong>
                <p>This file does not currently have any embedded audio tracks.</p>
              </div>
            </div>
          ) : (
            file.audioTracks.map((track) => (
              <article key={track.id} className={`track-card decision-${track.decision}`}>
                <div className="track-main">
                  <div className="track-heading">
                    <strong>
                      #{track.index} {track.language || "und"} {track.codec}
                    </strong>
                    <span className={`decision-badge decision-${track.decision}`}>{track.decision}</span>
                  </div>
                  <p className="track-title">{track.title || "Untitled track"}</p>
                  <p className="track-reason">{track.reason}</p>
                </div>
                <div className="track-flags">
                  <span>default: {track.default ? "yes" : "no"}</span>
                  <span>commentary: {track.commentary ? "yes" : "no"}</span>
                  <span>channels: {track.channels ?? "?"}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
