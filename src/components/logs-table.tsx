"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { AppLogEntry } from "@/lib/types";

export function LogsTable({ logs }: { logs: AppLogEntry[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedLog = useMemo(
    () => logs.find((log) => log.id === selectedId) ?? null,
    [logs, selectedId],
  );

  return (
    <>
      <div className="run-table">
        <div className="run-table-header logs-table-header">
          <span>Time</span>
          <span>Level</span>
          <span>Source</span>
          <span>Message</span>
          <span>Details</span>
        </div>
        {logs.map((log) => (
          <button key={log.id} type="button" className="run-row logs-row log-row-button" onClick={() => setSelectedId(log.id)}>
            <span>{formatDate(log.createdAt)}</span>
            <span className={`log-level log-level-${log.level}`}>{log.level}</span>
            <span className="run-mode">{log.source}</span>
            <span className="run-target">{log.message}</span>
            <span className="log-details" title={log.details ?? ""}>
              {log.details ?? "None"}
            </span>
          </button>
        ))}
      </div>

      {selectedLog ? (
        <div className="log-modal-backdrop" onClick={() => setSelectedId(null)}>
          <div className="log-modal" onClick={(event) => event.stopPropagation()}>
            <div className="log-modal-header">
              <div>
                <h2>Log Entry</h2>
                <div className="panel-meta">
                  <span>{formatDate(selectedLog.createdAt)}</span>
                  <span className={`log-level log-level-${selectedLog.level}`}>{selectedLog.level}</span>
                  <span className="run-mode">{selectedLog.source}</span>
                </div>
              </div>
              <button type="button" className="button button-secondary button-inline" onClick={() => setSelectedId(null)}>
                <X size={14} />
                Close
              </button>
            </div>

            <div className="log-modal-body">
              <div className="log-modal-section">
                <strong>Message</strong>
                <pre>{selectedLog.message}</pre>
              </div>
              <div className="log-modal-section">
                <strong>Details</strong>
                <pre>{selectedLog.details ?? "None"}</pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
