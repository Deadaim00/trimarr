import { FileNameCell } from "@/components/file-name-cell";
import type { MediaFileRecord } from "@/lib/types";

function categoryFor(path: string): "movie" | "tv" | "other" {
  if (path.includes("/Complete/TV/")) {
    return "tv";
  }

  if (path.includes("/Complete/Movies/")) {
    return "movie";
  }

  return "other";
}

export function FilesTable({ files, emptyMessage }: { files: MediaFileRecord[]; emptyMessage: string }) {
  return (
    <div className="file-table">
      <div className="file-table-header">
        <span>File</span>
        <span>Type</span>
        <span>Subs</span>
        <span>Keep Subs</span>
        <span>Audio</span>
        <span>Keep Audio</span>
        <span>Remove</span>
      </div>

      {files.length === 0 ? (
        <div className="empty-state compact-empty">
          <div>
            <strong>No files matched this view.</strong>
            <p>{emptyMessage}</p>
          </div>
        </div>
      ) : (
        files.map((file) => (
          <div key={file.id} className="file-row">
            <FileNameCell id={file.id} path={file.path} />
            <span className={`category-tag category-${categoryFor(file.path)}`}>{categoryFor(file.path)}</span>
            <span>{file.subtitleTrackCount}</span>
            <span className="metric-keep">{file.subtitleKeepCount}</span>
            <span>{file.audioTrackCount}</span>
            <span className="metric-keep">{file.audioKeepCount}</span>
            <span className="metric-remove">{file.removeCount}</span>
          </div>
        ))
      )}
    </div>
  );
}
