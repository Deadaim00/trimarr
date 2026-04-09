"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type QueueActionsProps = {
  mediaFileId: string;
  processingState: "queued" | "running" | "done" | "failed" | "idle";
};

export function QueueActions({ mediaFileId, processingState }: QueueActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function start(mode: "file" | "next") {
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

  const canStart = processingState !== "running" && processingState !== "done";
  const actionLabel = processingState === "failed" ? "Retry" : "Process";

  return (
    <div className="queue-action-cell">
      <button
        type="button"
        className="button button-secondary queue-action-button"
        disabled={!canStart || isPending}
        onClick={() => startTransition(() => start("file"))}
      >
        {processingState === "running" ? "Running" : actionLabel}
      </button>
      {processingState === "failed" ? <span className="queue-inline-note">Manual retry required</span> : null}
      {message ? <span className="queue-inline-message">{message}</span> : null}
    </div>
  );
}
