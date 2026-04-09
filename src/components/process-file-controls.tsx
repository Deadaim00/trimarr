"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { FilePlan } from "@/lib/types";

type ProcessFileControlsProps = {
  mediaFileId: string;
  canProcess: boolean;
  initialState: FilePlan["processingState"];
  initialProgress: number | null;
  initialMessage: string | null;
};

export function ProcessFileControls({
  mediaFileId,
  canProcess,
  initialState,
  initialProgress,
  initialMessage,
}: ProcessFileControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(initialMessage);
  const [localState, setLocalState] = useState<FilePlan["processingState"]>(initialState);
  const [localProgress, setLocalProgress] = useState<number | null>(initialProgress);

  useEffect(() => {
    if (initialState === "failed" && !initialMessage) {
      setMessage("Failed files stay blocked from automatic processing until you retry or rescan them.");
    } else {
      setMessage(initialMessage);
    }
    setLocalState(initialState);
    setLocalProgress(initialProgress);
  }, [initialMessage, initialProgress, initialState]);

  useEffect(() => {
    if (localState !== "running") {
      return;
    }

    const id = window.setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 2000);

    return () => window.clearInterval(id);
  }, [localState, router]);

  async function startProcessing() {
    setMessage(null);

    const response = await fetch("/api/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mediaFileId }),
    });

    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(payload.message ?? "Failed to start processing.");
      return;
    }

    setLocalState("running");
    setLocalProgress(0);
    setMessage(null);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Processing</h2>
      </div>

      <div className="process-panel">
        <div className="process-summary">
          <span className={clsx("queue-status", `queue-status-${localState}`)}>{localState}</span>
          <span className="muted">{message ?? "Ready."}</span>
        </div>

        <div className="process-progress">
          <div className="process-progress-track">
            <div className="process-progress-bar" style={{ width: `${localProgress ?? 0}%` }} />
          </div>
          <span>{localProgress ?? 0}%</span>
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={!canProcess || isPending || localState === "running"}
            onClick={startProcessing}
          >
            {localState === "running" ? "Processing..." : localState === "failed" ? "Retry File" : "Process File"}
          </button>
        </div>
      </div>
    </section>
  );
}
