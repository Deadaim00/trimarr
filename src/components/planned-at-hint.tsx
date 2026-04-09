"use client";

import { useState } from "react";
import { Info } from "lucide-react";

export function PlannedAtHint({ value }: { value: string }) {
  const [hovered, setHovered] = useState(false);

  return (
    <span
      className="planned-hint-wrap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <button type="button" className="planned-hint" aria-label={`Planned at ${value}`}>
        <Info size={14} />
      </button>
      <span className={`planned-popover ${hovered ? "planned-popover-visible" : ""}`}>{value}</span>
    </span>
  );
}
