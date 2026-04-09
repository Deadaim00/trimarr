import { FilesPagination } from "@/components/files-pagination";
import { FilesFilters } from "@/components/files-filters";
import { FilesTable } from "@/components/files-table";
import { countFiles, getDashboardStats, listFilesPage } from "@/lib/storage";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type FilesPageProps = {
  searchParams: Promise<{
    q?: string;
    result?: "all" | "matched" | "no_keep";
    category?: "all" | "movie" | "tv";
    subtitle_state?: "all" | "with_subtitles" | "without_subtitles";
    audio_state?: "all" | "extra_audio" | "single_audio";
    processed_state?: "all" | "processed" | "unprocessed";
    sort?: "name" | "tracks";
    page?: string;
  }>;
};

export default async function FilesPage({ searchParams }: FilesPageProps) {
  const params = await searchParams;
  const filters = {
    query: params.q,
    result: params.result ?? "all",
    category: params.category ?? "all",
    subtitleState: params.subtitle_state ?? "all",
    audioState: params.audio_state ?? "all",
    processedState: params.processed_state ?? "unprocessed",
    sort: params.sort ?? "name",
  } as const;
  const pageSize = 50;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const totalFiles = countFiles(filters);
  const totalPages = Math.max(1, Math.ceil(totalFiles / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const files = listFilesPage(filters, pageSize, (safePage - 1) * pageSize);
  const stats = getDashboardStats();

  return (
    <main className="page-shell">
      <section className="section-header">
        <h1>Files</h1>
        <div className="panel-meta">
          <span>
            {totalFiles} matching files
            {totalPages > 1 ? ` • page ${safePage} of ${totalPages}` : ""}
            {` • ${pageSize} per page`}
          </span>
          <span>Last scan: {formatDate(stats.lastScanAt)}</span>
        </div>
      </section>

      <section className="panel">
        <FilesFilters
          query={params.q ?? ""}
          category={params.category ?? "all"}
          result={params.result ?? "all"}
          subtitleState={params.subtitle_state ?? "all"}
          audioState={params.audio_state ?? "all"}
          processedState={params.processed_state ?? "unprocessed"}
          sort={params.sort ?? "name"}
        />
      </section>

      <section className="panel">
        <FilesTable files={files} emptyMessage="Try adjusting the search or filter." />
        <FilesPagination page={safePage} totalPages={totalPages} />
      </section>
    </main>
  );
}
