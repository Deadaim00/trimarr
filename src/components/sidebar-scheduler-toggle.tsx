"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SidebarSchedulerToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [isPending, startTransition] = useTransition();

  function update(nextValue: boolean) {
    setIsEnabled(nextValue);

    startTransition(async () => {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scheduleEnabled: nextValue,
        }),
      });

      if (!response.ok) {
        setIsEnabled(!nextValue);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="sidebar-scheduler">
      <div className="sidebar-scheduler-copy">
        <strong>Scheduler</strong>
        <span>{isEnabled ? "Enabled" : "Disabled"}</span>
      </div>
      <label className="settings-switch">
        <input type="checkbox" checked={isEnabled} disabled={isPending} onChange={(event) => update(event.target.checked)} />
        <span className="settings-switch-ui" aria-hidden="true" />
      </label>
    </div>
  );
}
