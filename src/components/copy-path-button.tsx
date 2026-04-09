"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { copyTextToClipboard } from "@/lib/client-copy";

export function CopyPathButton({ path }: { path: string }) {
  const [toastVisible, setToastVisible] = useState(false);

  async function copyPath(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();

    try {
      await copyTextToClipboard(path);
      setToastVisible(true);
      window.setTimeout(() => setToastVisible(false), 1800);
    } catch {
      setToastVisible(false);
    }
  }

  return (
    <>
      <button type="button" className="button button-secondary button-inline" onClick={copyPath}>
        <Copy size={14} />
        Copy Path
      </button>
      <span className={`toast-notice ${toastVisible ? "toast-notice-visible" : ""}`}>File path copied</span>
    </>
  );
}
