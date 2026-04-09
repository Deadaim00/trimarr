import Link from "next/link";
import { HistoryActions } from "@/components/history-actions";
import { HistoryFilters } from "@/components/history-filters";
import { FilesPagination } from "@/components/files-pagination";
import { formatBytes, formatDate } from "@/lib/format";
import { countProcessedFiles, getSettings, listProcessedFilesPage } from "@/lib/storage";

export const dynamic = "force-dynamic";

type HistoryPageProps = {
  searchParams: Promise<{
    q?: string;
    category?: "all" | "movie" | "tv";
    outcome?: "all" | "success" | "warnings";
    trash?: "all" | "with_trash" | "without_trash";
    page?: string;
  }>;
};

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const params = await searchParams;
  const filters = {
    query: params.q,
    category: params.category ?? "all",
    outcome: params.outcome ?? "all",
    trashState: params.trash ?? "all",
  } as const;
  const pageSize = 50;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const totalFiles = countProcessedFiles(filters);
  const totalPages = Math.max(1, Math.ceil(totalFiles / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const files = listProcessedFilesPage(filters, pageSize, (safePage - 1) * pageSize);
  const settings = getSettings();

  return (
    <main className="page-shell">
      <section className="section-header">
        <h1>History</h1>
        <div className="panel-meta">
          <span>
            {totalFiles} processed files
            {totalPages > 1 ? ` • page ${safePage} of ${totalPages}` : ""}
          </span>
          <span>{settings.trashEnabled ? "Trash retention enabled" : "Trash retention disabled"}</span>
        </div>
      </section>

      <section className="panel">
        <HistoryFilters
          query={params.q ?? ""}
          category={params.category ?? "all"}
          outcome={params.outcome ?? "all"}
          trashState={params.trash ?? "all"}
          showTrashFilter={settings.trashEnabled}
        />
      </section>

      <section className="panel">
        {files.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No processed files yet.</strong>
              <p>Processed files will appear here once Trimarr completes file work.</p>
            </div>
          </div>
        ) : (
          <div className="run-table">
            <div
              className={`run-table-header processed-table-header ${
                settings.trashEnabled ? "processed-table-header-with-action" : "processed-table-header-no-trash"
              }`}
            >
              <span>File</span>
              <span>Subs</span>
              <span>Audio</span>
              <span>Processed</span>
              <span>Before</span>
              <span>After</span>
              <span>Outcome</span>
              {settings.trashEnabled ? <span>Trash</span> : null}
              {settings.trashEnabled ? <span>Action</span> : null}
            </div>
            {files.map((file) => (
              <div
                key={file.mediaFileId}
                className={`run-row processed-row ${settings.trashEnabled ? "processed-row-with-action" : "processed-row-no-trash"}`}
              >
                <Link href={`/files/${file.mediaFileId}`} className="run-target inline-link" title={file.path}>
                  {file.path.split("/").at(-1)}
                </Link>
                <span>{file.subtitleTrackCount}</span>
                <span>{file.audioTrackCount}</span>
                <span>{formatDate(file.processedAt)}</span>
                <span>{file.sizeBeforeBytes ? formatBytes(file.sizeBeforeBytes) : "?"}</span>
                <span>{file.sizeAfterBytes ? formatBytes(file.sizeAfterBytes) : "?"}</span>
                <span className={`queue-status ${file.processedWithWarnings ? "queue-status-warn" : "queue-status-done"}`}>
                  {file.processedWithWarnings ? "Warnings" : "Success"}
                </span>
                {settings.trashEnabled ? (
                  <span>{file.trashAvailable ? "Available" : "None"}</span>
                ) : null}
                {settings.trashEnabled ? (
                  <HistoryActions mediaFileId={file.mediaFileId} canRevert={settings.trashEnabled && file.trashAvailable} />
                ) : null}
              </div>
            ))}
          </div>
        )}
        <FilesPagination page={safePage} totalPages={totalPages} />
      </section>
    </main>
  );
}
