"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type QueueFiltersProps = {
  query: string;
  status: string;
  result: string;
  category: string;
};

export function QueueFilters({ query, status, result, category }: QueueFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState(query);
  const [statusValue, setStatusValue] = useState(status);
  const [resultValue, setResultValue] = useState(result);
  const [categoryValue, setCategoryValue] = useState(category);

  function push(next: { q?: string; status?: string; result?: string; category?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const values = {
      q: next.q ?? text,
      status: next.status ?? statusValue,
      result: next.result ?? resultValue,
      category: next.category ?? categoryValue,
    };

    params.delete("page");

    for (const [key, value] of Object.entries(values)) {
      if (!value || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    startTransition(() => {
      router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    });
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (text !== query) {
        push({ q: text });
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [text, query]);

  return (
    <div className="filters-bar queue-filters-bar">
      <input
        className="input"
        placeholder="Search queued files"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <select
        className="input"
        value={statusValue}
        onChange={(event) => {
          const value = event.target.value;
          setStatusValue(value);
          push({ status: value });
        }}
      >
        <option value="all">All statuses</option>
        <option value="queued">Queued</option>
        <option value="running">Running</option>
        <option value="failed">Failed</option>
        <option value="skipped">Skipped</option>
        <option value="idle">Idle</option>
      </select>
      <select
        className="input"
        value={resultValue}
        onChange={(event) => {
          const value = event.target.value;
          setResultValue(value);
          push({ result: value });
        }}
      >
        <option value="all">All results</option>
        <option value="matched">Keep</option>
        <option value="no_keep">Remove</option>
      </select>
      <select
        className="input"
        value={categoryValue}
        onChange={(event) => {
          const value = event.target.value;
          setCategoryValue(value);
          push({ category: value });
        }}
      >
        <option value="all">All categories</option>
        <option value="movie">Movies</option>
        <option value="tv">TV</option>
      </select>
      <div className="filters-status">{isPending ? "Updating..." : ""}</div>
    </div>
  );
}
