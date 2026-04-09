"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type HistoryFiltersProps = {
  query: string;
  category: string;
  outcome: string;
  trashState: string;
  showTrashFilter: boolean;
};

export function HistoryFilters({ query, category, outcome, trashState, showTrashFilter }: HistoryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState(query);
  const [categoryValue, setCategoryValue] = useState(category);
  const [outcomeValue, setOutcomeValue] = useState(outcome);
  const [trashValue, setTrashValue] = useState(trashState);

  function push(next: { q?: string; category?: string; outcome?: string; trashState?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const values = {
      q: next.q ?? text,
      category: next.category ?? categoryValue,
      outcome: next.outcome ?? outcomeValue,
      trash: next.trashState ?? trashValue,
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
    <div className={`filters-bar ${showTrashFilter ? "history-filters-bar-with-trash" : "history-filters-bar-no-trash"}`}>
      <input
        className="input"
        placeholder="Search processed files"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
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
      <select
        className="input"
        value={outcomeValue}
        onChange={(event) => {
          const value = event.target.value;
          setOutcomeValue(value);
          push({ outcome: value });
        }}
      >
        <option value="all">All outcomes</option>
        <option value="success">Success</option>
        <option value="warnings">Warnings</option>
      </select>
      {showTrashFilter ? (
        <select
          className="input"
          value={trashValue}
          onChange={(event) => {
            const value = event.target.value;
            setTrashValue(value);
            push({ trashState: value });
          }}
        >
          <option value="all">All trash states</option>
          <option value="with_trash">With trash copy</option>
          <option value="without_trash">Without trash copy</option>
        </select>
      ) : null}
      <div className="filters-status">{isPending ? "Updating..." : ""}</div>
    </div>
  );
}
