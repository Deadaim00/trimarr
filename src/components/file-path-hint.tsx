"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { copyTextToClipboard } from "@/lib/client-copy";

export function FilePathHint({ path }: { path: string }) {
  const [hovered, setHovered] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  async function copy(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

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
      <span
        className="path-hint-wrap"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        <button type="button" className="path-hint" aria-label={`Copy path for ${path}`} onClick={copy}>
          <Copy size={14} />
        </button>
        <span className={`path-popover ${hovered ? "path-popover-visible" : ""}`}>{path}</span>
      </span>
      <span className={`toast-notice ${toastVisible ? "toast-notice-visible" : ""}`}>File path copied</span>
    </>
  );
}
