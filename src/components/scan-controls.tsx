"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import type { ActiveScanState } from "@/lib/types";

type ScanControlsProps = {
  roots: string[];
  scanLimit: number;
};

export function ScanControls({ roots, scanLimit }: ScanControlsProps) {
  const router = useRouter();
  const [customPath, setCustomPath] = useState("");
  const [selectedRoot, setSelectedRoot] = useState(roots[0] ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ActiveScanState | null>(null);
  const [isPending, startTransition] = useTransition();

  const canScanRoot = useMemo(() => selectedRoot.trim().length > 0, [selectedRoot]);
  const canScanFile = useMemo(() => customPath.trim().length > 0, [customPath]);

  useEffect(() => {
    let canceled = false;

    async function poll() {
      try {
        const response = await fetch("/api/scan", { cache: "no-store" });
        if (!response.ok || canceled) {
          return;
        }

        const payload = (await response.json()) as { scan?: ActiveScanState | null };
        if (!canceled) {
          setScanState(payload.scan ?? null);
        }
      } catch {
        // silent
      }
    }

    void poll();
    const id = window.setInterval(poll, 1000);
    return () => {
      canceled = true;
      window.clearInterval(id);
    };
  }, []);

  async function submit(body: Record<string, unknown>) {
    setMessage(null);
    const response = await fetch("/api/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      throw new Error(payload.message ?? "Scan failed.");
    }

    setMessage(payload.message ?? "Scan complete.");
    router.refresh();
  }

  function scanRoot() {
    startTransition(async () => {
      try {
        await submit({ mode: "root", root: selectedRoot, limit: scanLimit });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Scan failed.");
      }
    });
  }

  function scanAll() {
    startTransition(async () => {
      try {
        await submit({ mode: "root", root: selectedRoot, scanAll: true });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Scan failed.");
      }
    });
  }

  function scanFile() {
    startTransition(async () => {
      try {
        await submit({ mode: "file", path: customPath });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Scan failed.");
      }
    });
  }

  function cancelScan() {
    startTransition(async () => {
      try {
        await submit({ mode: "cancel" });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Cancel failed.");
      }
    });
  }

  return (
    <section className="panel scan-panel">
      <div className="panel-header">
        <h2>Scan</h2>
      </div>

      <div className="scan-grid">
        <div className="scan-card">
          <label className="field-label" htmlFor="root-select">
            Root
          </label>
          <select
            id="root-select"
            className="input"
            value={selectedRoot}
            onChange={(event) => setSelectedRoot(event.target.value)}
          >
            {roots.map((root) => (
              <option key={root} value={root}>
                {root}
              </option>
            ))}
          </select>
          <div className="scan-actions">
            <button className="button button-primary" disabled={!canScanRoot || isPending} onClick={scanRoot}>
              {isPending ? "Scanning..." : `Scan ${scanLimit}`}
            </button>
            <button className="button button-secondary" disabled={!canScanRoot || isPending} onClick={scanAll}>
              {isPending ? "Scanning..." : "Scan All"}
            </button>
          </div>
        </div>

        <div className="scan-card">
          <label className="field-label" htmlFor="file-path">
            File
          </label>
          <input
            id="file-path"
            className="input"
            placeholder="/mnt/media/Complete/Movies/Example (2024)/Example.mkv"
            value={customPath}
            onChange={(event) => setCustomPath(event.target.value)}
          />
          <button className="button button-secondary" disabled={!canScanFile || isPending} onClick={scanFile}>
            {isPending ? "Inspecting..." : "Inspect File"}
          </button>
        </div>
      </div>

      {scanState?.status === "running" ? (
        <div className="scan-progress-panel">
          <div className="scan-progress-meta">
            <strong>
              {scanState.scannedFiles}/{scanState.totalFiles || "?"} files
            </strong>
            <span>{scanState.message}</span>
          </div>
          <div className="process-progress-track">
            <div
              className="process-progress-bar"
              style={{
                width:
                  scanState.totalFiles > 0
                    ? `${Math.min(100, Math.round((scanState.scannedFiles / scanState.totalFiles) * 100))}%`
                    : "0%",
              }}
            />
          </div>
          <div className="panel-meta">
            <span>{scanState.subtitleTracksMapped} subtitle tracks mapped</span>
            <span>{scanState.audioTracksMapped} audio tracks mapped</span>
            <span>{scanState.target}</span>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isPending || scanState.cancelRequested}
              onClick={cancelScan}
            >
              {scanState.cancelRequested ? "Cancelling..." : "Cancel Scan"}
            </button>
          </div>
        </div>
      ) : null}

      <div className={clsx("status-pill", message ? "status-pill-active" : "status-pill-idle")}>
        {message ?? scanState?.message ?? "Idle"}
      </div>
    </section>
  );
}
