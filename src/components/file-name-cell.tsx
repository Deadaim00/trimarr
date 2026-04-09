"use client";

import Link from "next/link";
import { FilePathHint } from "@/components/file-path-hint";

type FileNameCellProps = {
  id: string;
  path: string;
};

export function FileNameCell({ id, path }: FileNameCellProps) {
  const name = path.split("/").at(-1) ?? path;

  return (
    <div className="file-link-cell">
      <FilePathHint path={path} />
      <Link href={`/files/${id}`} className="file-name-button file-name-link" title={path}>
        <span className="file-name-line">
          <strong>{name}</strong>
        </span>
      </Link>
    </div>
  );
}
