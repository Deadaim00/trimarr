"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type LogsFiltersProps = {
  query: string;
  level: string;
  source: string;
};

export function LogsFilters({ query, level, source }: LogsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState(query);
  const [levelValue, setLevelValue] = useState(level);
  const [sourceValue, setSourceValue] = useState(source);

  function push(next: { q?: string; level?: string; source?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");

    const values = {
      q: next.q ?? text,
      level: next.level ?? levelValue,
      source: next.source ?? sourceValue,
    };

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
    <div className="filters-bar logs-filters-bar">
      <input
        className="input"
        name="q"
        placeholder="Search message or details"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <select
        className="input"
        value={levelValue}
        onChange={(event) => {
          const value = event.target.value;
          setLevelValue(value);
          push({ level: value });
        }}
      >
        <option value="all">All levels</option>
        <option value="info">Info</option>
        <option value="warn">Warn</option>
        <option value="error">Error</option>
        <option value="debug">Debug</option>
      </select>
      <select
        className="input"
        value={sourceValue}
        onChange={(event) => {
          const value = event.target.value;
          setSourceValue(value);
          push({ source: value });
        }}
      >
        <option value="all">All sources</option>
        <option value="scan">Scan</option>
        <option value="process">Process</option>
        <option value="settings">Settings</option>
        <option value="queue">Queue</option>
        <option value="scheduler">Scheduler</option>
        <option value="system">System</option>
        <option value="webhook">Webhook</option>
      </select>
      <div className="filters-status">{isPending ? "Updating..." : ""}</div>
    </div>
  );
}
