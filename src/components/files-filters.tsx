"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type FilesFiltersProps = {
  query: string;
  category: string;
  result: string;
  subtitleState: string;
  audioState: string;
  processedState: string;
  sort: string;
};

export function FilesFilters({
  query,
  category,
  result,
  subtitleState,
  audioState,
  processedState,
  sort,
}: FilesFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState(query);
  const [categoryValue, setCategoryValue] = useState(category);
  const [resultValue, setResultValue] = useState(result);
  const [subtitleValue, setSubtitleValue] = useState(subtitleState);
  const [audioValue, setAudioValue] = useState(audioState);
  const [processedValue, setProcessedValue] = useState(processedState);
  const [sortValue, setSortValue] = useState(sort);

  function push(next: {
    q?: string;
    category?: string;
    result?: string;
    subtitleState?: string;
    audioState?: string;
    processedState?: string;
    sort?: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());

    const values = {
      q: next.q ?? text,
      category: next.category ?? categoryValue,
      result: next.result ?? resultValue,
      subtitle_state: next.subtitleState ?? subtitleValue,
      audio_state: next.audioState ?? audioValue,
      processed_state: next.processedState ?? processedValue,
      sort: next.sort ?? sortValue,
    };

    params.delete("page");

    for (const [key, value] of Object.entries(values)) {
      if (
        !value ||
        (value === "all" && key !== "processed_state") ||
        (key === "processed_state" && value === "unprocessed") ||
        (key === "sort" && value === "name")
      ) {
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
  }, [text]);

  return (
    <div className="filters-bar">
      <input
        className="input"
        name="q"
        placeholder="Search by path or filename"
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
        value={subtitleValue}
        onChange={(event) => {
          const value = event.target.value;
          setSubtitleValue(value);
          push({ subtitleState: value });
        }}
      >
        <option value="all">All subtitle states</option>
        <option value="with_subtitles">With subtitles</option>
        <option value="without_subtitles">No subtitles</option>
      </select>
      <select
        className="input"
        value={audioValue}
        onChange={(event) => {
          const value = event.target.value;
          setAudioValue(value);
          push({ audioState: value });
        }}
      >
        <option value="all">All audio states</option>
        <option value="extra_audio">More than 1 audio track</option>
        <option value="single_audio">1 audio track or less</option>
      </select>
      <select
        className="input"
        value={processedValue}
        onChange={(event) => {
          const value = event.target.value;
          setProcessedValue(value);
          push({ processedState: value });
        }}
      >
        <option value="unprocessed">Unprocessed</option>
        <option value="processed">Processed</option>
        <option value="all">All files</option>
      </select>
      <select
        className="input"
        value={sortValue}
        onChange={(event) => {
          const value = event.target.value;
          setSortValue(value);
          push({ sort: value });
        }}
      >
        <option value="name">Sort: Name</option>
        <option value="tracks">Sort: Tracks</option>
      </select>
      <div className="filters-status">{isPending ? "Updating..." : ""}</div>
    </div>
  );
}
