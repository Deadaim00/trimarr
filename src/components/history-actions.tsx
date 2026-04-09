"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function HistoryActions({ mediaFileId, canRevert }: { mediaFileId: string; canRevert: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function revert() {
    setMessage(null);
    const response = await fetch("/api/history/revert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaFileId }),
    });

    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(payload.message ?? "Revert failed.");
      return;
    }

    setMessage(payload.message ?? "Reverted.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="queue-action-cell">
      <button type="button" className="button button-secondary queue-action-button" disabled={!canRevert || isPending} onClick={() => startTransition(revert)}>
        Revert
      </button>
      {message ? <span className="queue-inline-message">{message}</span> : null}
    </div>
  );
}
