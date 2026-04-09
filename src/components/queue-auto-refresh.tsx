"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export function QueueAutoRefresh({ active, intervalMs = 1000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!active) {
      return;
    }

    const id = window.setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [active, intervalMs, router]);

  return null;
}
