import { FilesPagination } from "@/components/files-pagination";
import { LogsFilters } from "@/components/logs-filters";
import { LogsTable } from "@/components/logs-table";
import { countLogs, listLogsPage } from "@/lib/storage";

export const dynamic = "force-dynamic";

type LogsPageProps = {
  searchParams: Promise<{
    q?: string;
    level?: "all" | "info" | "warn" | "error" | "debug";
    source?: "all" | "scan" | "process" | "settings" | "queue" | "scheduler" | "system" | "webhook";
    page?: string;
  }>;
};

export default async function LogsPage({ searchParams }: LogsPageProps) {
  const params = await searchParams;
  const filters = {
    query: params.q,
    level: params.level ?? "all",
    source: params.source ?? "all",
  } as const;
  const pageSize = 50;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const totalLogs = countLogs(filters);
  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const logs = listLogsPage(filters, pageSize, (safePage - 1) * pageSize);

  return (
    <main className="page-shell">
      <section className="section-header">
        <h1>Logs</h1>
        <div className="panel-meta">
          <span>
            {totalLogs} matching entries
            {totalPages > 1 ? ` • page ${safePage} of ${totalPages}` : ""}
          </span>
        </div>
      </section>

      <section className="panel">
        <LogsFilters query={params.q ?? ""} level={params.level ?? "all"} source={params.source ?? "all"} />
      </section>

      <section className="panel">
        {logs.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No logs recorded yet.</strong>
              <p>Trimarr will capture scan, processing, settings, and queue events here.</p>
            </div>
          </div>
        ) : (
          <LogsTable logs={logs} />
        )}
        <FilesPagination page={safePage} totalPages={totalPages} />
      </section>
    </main>
  );
}
