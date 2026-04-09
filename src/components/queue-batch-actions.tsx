"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { QueueBatchState } from "@/lib/types";

export function QueueBatchActions({ failedCount, batchState }: { failedCount: number; batchState: QueueBatchState }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function processAll() {
    setMessage(null);
    const response = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "process_all" }),
    });

    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(payload.message ?? "Failed to start queue processing.");
      return;
    }

    startTransition(() => router.refresh());
  }

  async function cancelAll() {
    setMessage(null);
    const response = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "cancel_all" }),
    });

    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(payload.message ?? "Failed to stop queue processing.");
      return;
    }

    setMessage(payload.message ?? "Trimarr will stop after the current file finishes.");
    startTransition(() => router.refresh());
  }

  async function retryAllFailed() {
    setMessage(null);
    const response = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "retry_failed_all" }),
    });

    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(payload.message ?? "Failed to retry failed files.");
      return;
    }

    setMessage(payload.message ?? "Failed files queued for retry.");
    startTransition(() => router.refresh());
  }

  const isBatchActive = batchState.status === "running" || batchState.status === "stopping";
  const showRetry = failedCount > 0;

  if (!showRetry && !isBatchActive) {
    return (
      <div className="queue-batch-actions">
        <button type="button" className="button button-primary" disabled={isPending} onClick={() => startTransition(processAll)}>
          Process All
        </button>
        {message ? <span className="queue-inline-message">{message}</span> : null}
      </div>
    );
  }

  return (
    <div className="queue-batch-actions">
      {!isBatchActive ? (
        <button type="button" className="button button-primary" disabled={isPending} onClick={() => startTransition(processAll)}>
          Process All
        </button>
      ) : (
        <button
          type="button"
          className="button button-secondary"
          disabled={isPending || batchState.status === "stopping"}
          onClick={() => startTransition(cancelAll)}
        >
          {batchState.status === "stopping" ? "Cancelling..." : "Cancel"}
        </button>
      )}
      {showRetry ? (
        <button type="button" className="button button-secondary" disabled={isPending || isBatchActive} onClick={() => startTransition(retryAllFailed)}>
          Retry All Failed
        </button>
      ) : null}
      {message ? <span className="queue-inline-message">{message}</span> : null}
    </div>
  );
}
