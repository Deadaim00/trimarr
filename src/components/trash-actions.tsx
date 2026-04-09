"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function TrashActions({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function empty() {
    setMessage(null);
    const response = await fetch("/api/trash/empty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(payload.message ?? "Empty trash failed.");
      return;
    }

    setMessage(payload.message ?? "Trash emptied.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="queue-batch-actions">
      <button type="button" className="button button-secondary" disabled={!enabled || isPending} onClick={() => startTransition(empty)}>
        Empty Trash
      </button>
      {message ? <span className="queue-inline-message">{message}</span> : null}
    </div>
  );
}
