import { Film } from "lucide-react";
import { SidebarNav } from "@/components/sidebar-nav";
import { SidebarSchedulerToggle } from "@/components/sidebar-scheduler-toggle";
import { getQueueCount, getSettings } from "@/lib/storage";

export function AppShell({ children }: { children: React.ReactNode }) {
  const queueCount = getQueueCount();
  const settings = getSettings();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-panel">
          <div className="brand-mark">
            <Film size={18} />
          </div>
          <div>
            <p className="eyebrow">Trimarr</p>
          </div>
        </div>

        <SidebarSchedulerToggle enabled={settings.scheduleEnabled} />
        <SidebarNav queueCount={queueCount} />
      </aside>

      <div className="app-content">{children}</div>
    </div>
  );
}
