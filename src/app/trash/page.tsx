import { TrashActions } from "@/components/trash-actions";
import { formatBytes, formatDate } from "@/lib/format";
import { getSettings, listTrashItems } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const settings = getSettings();
  const items = listTrashItems(500);

  return (
    <main className="page-shell">
      <section className="section-header">
        <h1>Trash</h1>
        <div className="panel-meta">
          <span>{items.length} stored originals</span>
          <span>{settings.trashEnabled ? `${settings.trashRetentionDays} day retention` : "Trash disabled"}</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Stored Duplicates</h2>
          <TrashActions enabled={settings.trashEnabled} />
        </div>
        <div className="panel-meta">
          <span>Trash stores a full duplicate of the original file after a successful process.</span>
          <span>Emptying trash permanently removes those stored originals.</span>
        </div>
      </section>

      <section className="panel">
        {!settings.trashEnabled ? (
          <div className="empty-state">
            <div>
              <strong>Trash retention is disabled.</strong>
              <p>Enable trash retention in settings if you want Trimarr to keep full-duplicate originals for revert.</p>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No trash files stored right now.</strong>
              <p>Successful processing runs will place original files here when trash retention is enabled.</p>
            </div>
          </div>
        ) : (
          <div className="run-table">
            <div className="run-table-header trash-table-header">
              <span>Original Path</span>
              <span>Stored</span>
              <span>Expires</span>
              <span>Size</span>
              <span>Trash Path</span>
            </div>
            {items.map((item) => (
              <div key={item.id} className="run-row trash-row">
                <span className="run-target" title={item.originalPath}>
                  {item.originalPath}
                </span>
                <span>{formatDate(item.createdAt)}</span>
                <span>{formatDate(item.expiresAt)}</span>
                <span>{formatBytes(item.sizeBytes)}</span>
                <span className="log-details" title={item.trashPath}>
                  {item.trashPath}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
