import { SettingsForm } from "@/components/settings-form";
import { getSettings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = getSettings();

  return (
    <main className="page-shell">
      <section className="section-header section-header-stack">
        <h1>Settings</h1>
        <span className="muted">Manage Trimarr scan roots and keep rules for embedded subtitle tracks.</span>
      </section>

      <SettingsForm settings={settings} />
    </main>
  );
}
