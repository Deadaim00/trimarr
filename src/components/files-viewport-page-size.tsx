"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

type FilesViewportPageSizeProps = {
  currentPageSize: number;
};

function calculatePageSize(viewportHeight: number): number {
  const reservedHeight = 320;
  const rowHeight = 42;
  const availableHeight = Math.max(0, viewportHeight - reservedHeight);
  const rows = Math.floor(availableHeight / rowHeight);

  return Math.max(8, Math.min(40, rows));
}

export function FilesViewportPageSize({ currentPageSize }: FilesViewportPageSizeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    function syncPageSize() {
      const nextPageSize = calculatePageSize(window.innerHeight);
      if (nextPageSize === currentPageSize) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      params.set("page_size", String(nextPageSize));
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }

    const timeout = window.setTimeout(syncPageSize, 10);
    window.addEventListener("resize", syncPageSize);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("resize", syncPageSize);
    };
  }, [currentPageSize, pathname, router, searchParams]);

  return null;
}
