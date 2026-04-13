"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type QueueActionsProps = {
  mediaFileId: string;
  processingState: "queued" | "running" | "done" | "failed" | "skipped" | "idle";
};

export function QueueActions({ mediaFileId, processingState }: QueueActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function submit(mode: "file" | "next" | "skip" | "unskip") {
    setMessage(null);
    const response = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "next" ? { mode } : { mode, mediaFileId }),
    });

    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(payload.message ?? "Failed to start processing.");
      return;
    }

    startTransition(() => router.refresh());
  }

  const canStart = processingState !== "running" && processingState !== "done" && processingState !== "skipped";
  const canSkip = processingState !== "running" && processingState !== "done" && processingState !== "skipped";
  const canUnskip = processingState === "skipped";
  const actionLabel = processingState === "failed" ? "Retry" : "Process";

  return (
    <div className="queue-action-cell">
      {canUnskip ? (
        <button
          type="button"
          className="button button-secondary queue-action-button"
          disabled={isPending}
          onClick={() => startTransition(() => submit("unskip"))}
        >
          Unskip
        </button>
      ) : (
        <button
          type="button"
          className="button button-secondary queue-action-button"
          disabled={!canStart || isPending}
          onClick={() => startTransition(() => submit("file"))}
        >
          {processingState === "running" ? "Running" : actionLabel}
        </button>
      )}
      {canSkip ? (
        <button
          type="button"
          className="button button-secondary queue-action-button"
          disabled={isPending}
          onClick={() => startTransition(() => submit("skip"))}
        >
          Skip
        </button>
      ) : null}
      {processingState === "failed" ? <span className="queue-inline-note">Manual retry or skip required</span> : null}
      {message ? <span className="queue-inline-message">{message}</span> : null}
    </div>
  );
}
