"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { copyTextToClipboard } from "@/lib/client-copy";
import { SERVER_LOCAL_TIMEZONE } from "@/lib/config";
import type { TrimarrSettings } from "@/lib/types";

export function SettingsForm({ settings }: { settings: TrimarrSettings }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [scanLimit, setScanLimit] = useState(String(settings.scanLimit));
  const [maxConcurrentJobs, setMaxConcurrentJobs] = useState(String(settings.maxConcurrentJobs));
  const [libraryPathPrefix, setLibraryPathPrefix] = useState(settings.libraryPathPrefix);
  const [rootsText, setRootsText] = useState(settings.scanRoots.join("\n"));
  const [subtitleProcessingEnabled, setSubtitleProcessingEnabled] = useState(settings.subtitleProcessingEnabled);
  const [keepEnglishSubtitleTracks, setKeepEnglishSubtitleTracks] = useState(settings.keepEnglishSubtitleTracks);
  const [keepForcedEnglishSubtitles, setKeepForcedEnglishSubtitles] = useState(settings.keepForcedEnglishSubtitles);
  const [keepEnglishSdhSubtitles, setKeepEnglishSdhSubtitles] = useState(settings.keepEnglishSdhSubtitles);
  const [audioProcessingEnabled, setAudioProcessingEnabled] = useState(settings.audioProcessingEnabled);
  const [keepEnglishAudio, setKeepEnglishAudio] = useState(settings.keepEnglishAudio);
  const [keepCommentaryAudio, setKeepCommentaryAudio] = useState(settings.keepCommentaryAudio);
  const [keepUnknownAudio, setKeepUnknownAudio] = useState(settings.keepUnknownAudio);
  const [keepDefaultAudio, setKeepDefaultAudio] = useState(settings.keepDefaultAudio);
  const [scheduleEnabled, setScheduleEnabled] = useState(settings.scheduleEnabled);
  const [scheduleRunAt, setScheduleRunAt] = useState(settings.scheduleRunAt);
  const [scheduleEndAt, setScheduleEndAt] = useState(settings.scheduleEndAt);
  const [scheduleTimeZone, setScheduleTimeZone] = useState(settings.scheduleTimeZone);
  const [scheduleScanBeforeProcessing, setScheduleScanBeforeProcessing] = useState(settings.scheduleScanBeforeProcessing);
  const [scheduleScanNewOrChangedOnly, setScheduleScanNewOrChangedOnly] = useState(
    settings.scheduleScanNewOrChangedOnly,
  );
  const [scheduleProcessUnprocessedOnly, setScheduleProcessUnprocessedOnly] = useState(
    settings.scheduleProcessUnprocessedOnly,
  );
  const [webhookEnabled, setWebhookEnabled] = useState(settings.webhookEnabled);
  const [webhookAutoProcessWhenIdle, setWebhookAutoProcessWhenIdle] = useState(settings.webhookAutoProcessWhenIdle);
  const [verboseLogging, setVerboseLogging] = useState(settings.verboseLogging);
  const [logRetentionDays, setLogRetentionDays] = useState(String(settings.logRetentionDays));
  const [trashEnabled, setTrashEnabled] = useState(settings.trashEnabled);
  const [trashRetentionDays, setTrashRetentionDays] = useState(String(settings.trashRetentionDays));
  const [webhookToken, setWebhookToken] = useState(settings.webhookToken);
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/arr` : "/api/webhooks/arr";
  const timeZoneOptions =
    typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
      ? [SERVER_LOCAL_TIMEZONE, ...Intl.supportedValuesOf("timeZone")]
      : [SERVER_LOCAL_TIMEZONE, settings.scheduleTimeZone].filter(
          (value, index, array) => Boolean(value) && array.indexOf(value) === index,
        );

  const canSubmit = useMemo(
    () => rootsText.trim().length > 0 && libraryPathPrefix.trim().length > 0 && (!webhookEnabled || webhookToken.trim().length > 0),
    [rootsText, libraryPathPrefix, webhookEnabled, webhookToken],
  );

  function showToast() {
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 1800);
  }

  function generateWebhookToken() {
    const array = new Uint8Array(24);
    crypto.getRandomValues(array);
    const token = Array.from(array, (value) => value.toString(16).padStart(2, "0")).join("");
    setWebhookToken(token);
    setShowWebhookToken(true);
    setMessage("Generated a new webhook API key. Save settings to apply it.");
  }

  async function copyWebhookToken() {
    if (!webhookToken.trim()) {
      setMessage("Generate or enter a webhook API key first.");
      return;
    }

    try {
      await copyTextToClipboard(webhookToken);
      showToast();
    } catch {
      setMessage("Failed to copy the webhook API key.");
    }
  }

  async function copyWebhookUrl() {
    try {
      await copyTextToClipboard(webhookUrl);
      showToast();
    } catch {
      setMessage("Failed to copy the webhook URL.");
    }
  }

  function submit() {
    startTransition(async () => {
      setMessage(null);

      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scanRoots: rootsText
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          scanLimit: Number(scanLimit),
          maxConcurrentJobs: Number(maxConcurrentJobs),
          libraryPathPrefix,
          subtitleProcessingEnabled,
          keepEnglishSubtitleTracks,
          keepForcedEnglishSubtitles,
          keepEnglishSdhSubtitles,
          audioProcessingEnabled,
          keepEnglishAudio,
          keepCommentaryAudio,
          keepUnknownAudio,
          keepDefaultAudio,
          scheduleEnabled,
          scheduleRunAt,
          scheduleEndAt,
          scheduleTimeZone,
          scheduleScanBeforeProcessing,
          scheduleScanNewOrChangedOnly,
          scheduleProcessUnprocessedOnly,
          webhookEnabled,
          webhookAutoProcessWhenIdle,
          verboseLogging,
          logRetentionDays: Number(logRetentionDays),
          trashEnabled,
          trashRetentionDays: Number(trashRetentionDays),
          webhookToken,
        }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Failed to save settings.");
        return;
      }

      setMessage(payload.message ?? "Settings saved.");
      router.refresh();
    });
  }

  return (
    <section className="settings-layout">
      <section className="settings-hero">
        <div>
          <h2>Trimarr Configuration</h2>
          <p>Set scan scope and decide which embedded subtitle tracks stay in your keep policy.</p>
        </div>
      </section>

      <section className="settings-group">
        <header className="settings-group-header">
          <h2>Library</h2>
          <p>Define where Trimarr scans and how it classifies media in your library.</p>
        </header>

        <div className="settings-list">
          <label className="settings-row" htmlFor="library-prefix">
            <div className="settings-copy">
              <strong>Library prefix</strong>
              <span>Used to normalize paths and identify media roots.</span>
            </div>
            <div className="settings-control">
              <input
                id="library-prefix"
                className="input"
                value={libraryPathPrefix}
                onChange={(event) => setLibraryPathPrefix(event.target.value)}
              />
            </div>
          </label>

          <label className="settings-row" htmlFor="scan-limit">
            <div className="settings-copy">
              <strong>Scan number</strong>
              <span>Controls how many files Trimarr pulls back when scanning a root with the limited scan action.</span>
            </div>
            <div className="settings-control settings-control-small">
              <input
                id="scan-limit"
                className="input"
                inputMode="numeric"
                value={scanLimit}
                onChange={(event) => setScanLimit(event.target.value)}
              />
            </div>
          </label>

          <label className="settings-row" htmlFor="max-concurrent-jobs">
            <div className="settings-copy">
              <strong>Concurrent processors</strong>
              <span>How many files Trimarr is allowed to remux at the same time. Start with 2 if your storage can keep up.</span>
            </div>
            <div className="settings-control settings-control-small">
              <select
                id="max-concurrent-jobs"
                className="input"
                value={maxConcurrentJobs}
                onChange={(event) => setMaxConcurrentJobs(event.target.value)}
              >
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="settings-row settings-row-block" htmlFor="roots">
            <div className="settings-copy">
              <strong>Enabled roots</strong>
              <span>One root per line. These paths are scanned for MKV inventory.</span>
            </div>
            <div className="settings-control settings-control-block">
              <textarea
                id="roots"
                className="input textarea"
                value={rootsText}
                onChange={(event) => setRootsText(event.target.value)}
              />
            </div>
          </label>
        </div>
      </section>

      <section className="settings-group">
        <header className="settings-group-header">
          <h2>Keep Policy</h2>
          <p>These switches control whether Trimarr touches subtitle and audio tracks, and what it keeps when enabled.</p>
        </header>

        <div className="settings-list">
          <div className="settings-subsection">
            <div className="settings-subsection-header">
              <h3>Subtitles</h3>
            </div>
          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={subtitleProcessingEnabled}
                onChange={(event) => setSubtitleProcessingEnabled(event.target.checked)}
              />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className="settings-copy">
              <strong>Enable subtitle processing</strong>
              <span>Turn subtitle track removal on or off completely.</span>
            </div>
          </label>

          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={keepForcedEnglishSubtitles}
                disabled={!subtitleProcessingEnabled}
                onChange={(event) => setKeepForcedEnglishSubtitles(event.target.checked)}
              />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className={clsx("settings-copy", !subtitleProcessingEnabled && "settings-copy-disabled")}>
              <strong>Forced English subtitles</strong>
              <span>Keep forced English subtitle tracks.</span>
            </div>
          </label>

          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={keepEnglishSubtitleTracks}
                disabled={!subtitleProcessingEnabled}
                onChange={(event) => setKeepEnglishSubtitleTracks(event.target.checked)}
              />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className={clsx("settings-copy", !subtitleProcessingEnabled && "settings-copy-disabled")}>
              <strong>Standard English subtitles</strong>
              <span>Keep regular English subtitle tracks.</span>
            </div>
          </label>

          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={keepEnglishSdhSubtitles}
                disabled={!subtitleProcessingEnabled}
                onChange={(event) => setKeepEnglishSdhSubtitles(event.target.checked)}
              />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className={clsx("settings-copy", !subtitleProcessingEnabled && "settings-copy-disabled")}>
              <strong>English SDH / HI subtitles</strong>
              <span>Keep subtitles tagged as hearing-impaired or SDH.</span>
            </div>
          </label>
          </div>

          <div className="settings-subsection">
            <div className="settings-subsection-header">
              <h3>Audio Tracks</h3>
            </div>
          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={audioProcessingEnabled}
                onChange={(event) => setAudioProcessingEnabled(event.target.checked)}
              />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className="settings-copy">
              <strong>Enable audio processing</strong>
              <span>Turn audio track removal on or off completely.</span>
            </div>
          </label>

          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={keepEnglishAudio}
                disabled={!audioProcessingEnabled}
                onChange={(event) => setKeepEnglishAudio(event.target.checked)}
              />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className={clsx("settings-copy", !audioProcessingEnabled && "settings-copy-disabled")}>
              <strong>English audio</strong>
              <span>Keep English-language audio tracks.</span>
            </div>
          </label>

          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={keepCommentaryAudio}
                disabled={!audioProcessingEnabled}
                onChange={(event) => setKeepCommentaryAudio(event.target.checked)}
              />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className={clsx("settings-copy", !audioProcessingEnabled && "settings-copy-disabled")}>
              <strong>Commentary audio</strong>
              <span>Keep commentary tracks even if they are not the main audio.</span>
            </div>
          </label>

          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={keepUnknownAudio}
                disabled={!audioProcessingEnabled}
                onChange={(event) => setKeepUnknownAudio(event.target.checked)}
              />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className={clsx("settings-copy", !audioProcessingEnabled && "settings-copy-disabled")}>
              <strong>Unknown-language audio</strong>
              <span>Keep audio tracks with missing language metadata for safety.</span>
            </div>
          </label>

          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={keepDefaultAudio}
                disabled={!audioProcessingEnabled}
                onChange={(event) => setKeepDefaultAudio(event.target.checked)}
              />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className={clsx("settings-copy", !audioProcessingEnabled && "settings-copy-disabled")}>
              <strong>Default audio track</strong>
              <span>Keep the default audio track even if the language metadata is incomplete.</span>
            </div>
          </label>
          </div>
        </div>
      </section>

      <section className="settings-group">
        <header className="settings-group-header">
          <h2>Scheduling</h2>
          <p>Prepare Trimarr for automated processing of files that have not been processed yet.</p>
        </header>

        <div className="settings-list">
          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input type="checkbox" checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className="settings-copy">
              <strong>Enable schedule</strong>
              <span>Allow Trimarr to run scheduled work against its queue at the configured time.</span>
            </div>
          </label>

          <label className="settings-row" htmlFor="schedule-time">
            <div className="settings-copy">
              <strong>Run time</strong>
              <span>Time of day when scheduled processing should begin.</span>
            </div>
            <div className="settings-control settings-control-small">
              <input
                id="schedule-time"
                className="input"
                type="time"
                value={scheduleRunAt}
                onChange={(event) => setScheduleRunAt(event.target.value)}
              />
            </div>
          </label>

          <label className="settings-row" htmlFor="schedule-end-time">
            <div className="settings-copy">
              <strong>End time</strong>
              <span>Trimarr will stop starting new scheduled files after this time. The current file will still finish.</span>
            </div>
            <div className="settings-control settings-control-small">
              <input
                id="schedule-end-time"
                className="input"
                type="time"
                value={scheduleEndAt}
                onChange={(event) => setScheduleEndAt(event.target.value)}
              />
            </div>
          </label>

          <label className="settings-row" htmlFor="schedule-timezone">
            <div className="settings-copy">
              <strong>Time zone</strong>
              <span>
                Use server local time by default, or pin the schedule to a specific IANA timezone.
              </span>
            </div>
            <div className="settings-control">
              <select
                id="schedule-timezone"
                className="input"
                value={scheduleTimeZone}
                onChange={(event) => setScheduleTimeZone(event.target.value)}
              >
                {timeZoneOptions.map((value) => (
                  <option key={value} value={value}>
                    {value === SERVER_LOCAL_TIMEZONE ? "Server local time" : value}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={scheduleScanBeforeProcessing}
                onChange={(event) => setScheduleScanBeforeProcessing(event.target.checked)}
              />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className="settings-copy">
              <strong>Scan before processing</strong>
              <span>When scheduled work starts, refresh the library inventory first before processing queued files.</span>
            </div>
          </label>

          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={scheduleScanNewOrChangedOnly}
                onChange={(event) => setScheduleScanNewOrChangedOnly(event.target.checked)}
              />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className="settings-copy">
              <strong>Only scan new or changed files</strong>
              <span>For scheduled scans, inspect only unseen files or files modified since the last root scan.</span>
            </div>
          </label>

          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={scheduleProcessUnprocessedOnly}
                onChange={(event) => setScheduleProcessUnprocessedOnly(event.target.checked)}
              />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className="settings-copy">
              <strong>Only process unprocessed files</strong>
              <span>Limit scheduled work to files that have not already been processed.</span>
            </div>
          </label>
        </div>
      </section>

      <section className="settings-group">
        <header className="settings-group-header">
          <h2>Trash</h2>
          <p>Keep the original file after processing as a full duplicate so you can revert later.</p>
        </header>

        <div className="settings-list">
          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input type="checkbox" checked={trashEnabled} onChange={(event) => setTrashEnabled(event.target.checked)} />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className="settings-copy">
              <strong>Enable trash retention</strong>
              <span>Stores the original media file as a full duplicate after a successful run so it can be restored later.</span>
            </div>
          </label>

          <label className="settings-row" htmlFor="trash-retention">
            <div className="settings-copy">
              <strong>Retention days</strong>
              <span>Number of days to keep full-duplicate originals in trash before they are eligible for cleanup.</span>
            </div>
            <div className="settings-control settings-control-small">
              <input
                id="trash-retention"
                className="input"
                inputMode="numeric"
                value={trashRetentionDays}
                onChange={(event) => setTrashRetentionDays(event.target.value)}
              />
            </div>
          </label>
        </div>
      </section>

      <section className="settings-group">
        <header className="settings-group-header">
          <h2>Logging</h2>
          <p>Keep core events by default, control retention, or enable verbose logs for deeper processing detail.</p>
        </header>

        <div className="settings-list">
          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input type="checkbox" checked={verboseLogging} onChange={(event) => setVerboseLogging(event.target.checked)} />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className="settings-copy">
              <strong>Verbose logging</strong>
              <span>Capture detailed scan and processing progress entries in the Trimarr logs page.</span>
            </div>
          </label>

          <label className="settings-row" htmlFor="log-retention-days">
            <div className="settings-copy">
              <strong>Log retention days</strong>
              <span>Older log entries are pruned during scheduled maintenance runs.</span>
            </div>
            <div className="settings-control settings-control-small">
              <input
                id="log-retention-days"
                className="input"
                inputMode="numeric"
                value={logRetentionDays}
                onChange={(event) => setLogRetentionDays(event.target.value)}
              />
            </div>
          </label>
        </div>
      </section>

      <section className="settings-group">
        <header className="settings-group-header">
          <h2>Webhooks</h2>
          <p>Allow Sonarr and Radarr to push newly imported files into Trimarr immediately. Unauthorized webhooks are not accepted.</p>
        </header>

        <div className="settings-list">
          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input type="checkbox" checked={webhookEnabled} onChange={(event) => setWebhookEnabled(event.target.checked)} />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className="settings-copy">
              <strong>Enable webhooks</strong>
              <span>Allow Sonarr or Radarr to push newly imported files into Trimarr immediately.</span>
            </div>
          </label>

          <label className="settings-row settings-toggle-setting">
            <span className="settings-switch">
              <input
                type="checkbox"
                checked={webhookAutoProcessWhenIdle}
                disabled={!webhookEnabled}
                onChange={(event) => setWebhookAutoProcessWhenIdle(event.target.checked)}
              />
              <span className="settings-switch-ui" aria-hidden="true" />
            </span>
            <div className={clsx("settings-copy", !webhookEnabled && "settings-copy-disabled")}>
              <strong>Auto-process when idle</strong>
              <span>When a webhook adds files and Trimarr is idle, start the normal queue processor automatically.</span>
            </div>
          </label>

          <label className="settings-row settings-row-block" htmlFor="webhook-url">
            <div className="settings-copy">
              <strong>Webhook URL</strong>
              <span>Point Sonarr or Radarr here with a custom webhook or connect webhook.</span>
            </div>
            <div className="settings-control settings-control-block">
              <div className="settings-inline-control">
                <input id="webhook-url" className="input" value={webhookUrl} readOnly />
                <button type="button" className="button button-secondary" onClick={copyWebhookUrl}>
                  Copy URL
                </button>
              </div>
            </div>
          </label>

          <label className="settings-row settings-row-block" htmlFor="webhook-token">
            <div className="settings-copy">
              <strong>Webhook API key</strong>
              <span>
                Optional shared key for the Arr webhook endpoint. Trimarr accepts it as <code>x-api-key</code>, <code>x-trimarr-token</code>, a bearer token, or <code>?token=...</code>.
              </span>
            </div>
            <div className="settings-control settings-control-block">
              <div className="settings-inline-control">
                <input
                  id="webhook-token"
                  className="input"
                  type={showWebhookToken ? "text" : "password"}
                  value={webhookToken}
                  onChange={(event) => setWebhookToken(event.target.value)}
                  onFocus={() => setShowWebhookToken(true)}
                  onBlur={() => setShowWebhookToken(false)}
                  placeholder="Required when webhooks are enabled"
                  autoComplete="off"
                />
                <button type="button" className="button button-secondary" onClick={generateWebhookToken}>
                  Generate
                </button>
                <button type="button" className="button button-secondary" onClick={copyWebhookToken} disabled={!webhookToken.trim()}>
                  Copy
                </button>
              </div>
            </div>
          </label>
        </div>
      </section>

      <div className="settings-actions">
        <button className="button button-primary" disabled={!canSubmit || isPending} onClick={submit}>
          {isPending ? "Saving..." : "Save Settings"}
        </button>

        <div className={clsx("status-pill", message ? "status-pill-active" : "status-pill-idle")}>
          {message ?? "No pending changes."}
        </div>
      </div>
      <span className={`toast-notice ${toastVisible ? "toast-notice-visible" : ""}`}>Copied to clipboard</span>
    </section>
  );
}
