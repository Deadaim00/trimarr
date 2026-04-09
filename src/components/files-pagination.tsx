"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type FilesPaginationProps = {
  page: number;
  totalPages: number;
};

export function FilesPagination({ page, totalPages }: FilesPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) {
    return null;
  }

  function goTo(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());

    if (nextPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(nextPage));
    }

    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

  const visiblePages = totalPages <= 5 ? Array.from({ length: totalPages }, (_, index) => index + 1) : (() => {
    if (page <= 3) {
      return [1, 2, 3, 4, 5];
    }

    if (page >= totalPages - 2) {
      return Array.from({ length: 5 }, (_, index) => totalPages - 4 + index);
    }

    return [page - 2, page - 1, page, page + 1, page + 2];
  })();

  return (
    <div className="pagination-bar">
      <button className="button button-secondary" type="button" onClick={() => goTo(page - 1)} disabled={page <= 1}>
        Previous
      </button>
      <div className="pagination-pages">
        {visiblePages.map((value) => (
          <button
            key={value}
            className={`page-link ${value === page ? "page-link-active" : ""}`}
            type="button"
            onClick={() => goTo(value)}
          >
            {value}
          </button>
        ))}
        {totalPages > 5 && visiblePages[visiblePages.length - 1] < totalPages - 1 ? <span className="pagination-ellipsis">...</span> : null}
        {totalPages > 5 && visiblePages[visiblePages.length - 1] < totalPages ? (
          <button
            className={`page-link ${totalPages === page ? "page-link-active" : ""}`}
            type="button"
            onClick={() => goTo(totalPages)}
          >
            {totalPages}
          </button>
        ) : null}
      </div>
      <button
        className="button button-secondary"
        type="button"
        onClick={() => goTo(page + 1)}
        disabled={page >= totalPages}
      >
        Next
      </button>
    </div>
  );
}
