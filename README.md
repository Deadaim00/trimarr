# Trimarr

Trimarr is an Arr-style web app for reclaiming storage from MKV files by removing unwanted embedded subtitle and audio tracks without re-encoding video.

It is built for Linux media libraries and focuses on:

- track inspection and planning
- safe single-file and queue-based processing
- scheduler support
- queue, history, trash, logs, and statistics
- Sonarr / Radarr webhook intake for newly imported files
- SABnzbd post-processing trigger support for completed downloads

## What Trimarr Does

Trimarr remuxes files. It does **not** transcode video or audio.

That means:

- video quality is preserved
- audio/video codecs are preserved
- only selected embedded tracks are removed

## Quick Start

1. Copy the example environment file.

```bash
cp .env.example .env
```

2. Edit `.env` and set `MEDIA_ROOT` to your media library mount.

3. Start Trimarr.

```bash
docker compose up -d --build
```

4. Open the UI:

```text
http://localhost:7676
```

## Docker Compose

Trimarr ships with a portable [`compose.yaml`](./compose.yaml).

Volumes:

- `./data:/data`
  - stores the SQLite database, logs, and optional trash copies
- `${MEDIA_ROOT}:/mnt/media`
  - mounts your media library into the container

Environment:

- `TRIMARR_PORT`
  - host port for the web UI
- `TZ`
  - scheduler and display timezone
- `MEDIA_ROOT`
  - host path for the media library mount

## Recommended Setup

- mount your library over local disk or NFS if possible
- test on a few files before enabling scheduled processing
- enable trash retention until you trust your keep policy
- use the Statistics, History, and Logs pages to watch behavior

## Webhooks

Trimarr supports Sonarr / Radarr webhook intake so newly imported files can be added immediately.

In Trimarr:

- enable `Webhooks`
- generate an API key

In Sonarr / Radarr:

- add a `Webhook`
- point it at:

```text
http://YOUR_HOST:7676/api/webhooks/arr
```

- send the API key as:

```text
X-Api-Key: YOUR_KEY
```

If custom headers are not available, you can use:

```text
http://YOUR_HOST:7676/api/webhooks/arr?token=YOUR_KEY
```

## SABnzbd Post-Processing

Trimarr also ships with a SABnzbd-compatible post-processing script:

- [`scripts/sabnzbd/trimarr-post-process.sh`](./scripts/sabnzbd/trimarr-post-process.sh)

Recommended setup:

1. Mount the script into your SAB container, or copy it into SAB's configured script directory.
2. Make sure the paths SAB sees are the same library paths Trimarr can inspect.
3. Set these environment variables for SAB:

```text
TRIMARR_URL=http://YOUR_TRIMARR_HOST:7676
TRIMARR_API_KEY=YOUR_TRIMARR_WEBHOOK_KEY
```

4. In SABnzbd, choose `trimarr-post-process.sh` as the post-processing script for the category you want Trimarr to catch.

The script sends the completed SAB path to:

```text
http://YOUR_HOST:7676/api/webhooks/sab
```

Behavior:

- it expands completed release folders and queues any `.mkv` files found inside
- it uses the same Webhooks toggle and API key as the Arr webhook endpoint
- it does not fail the SAB job if Trimarr is temporarily unavailable

## Publishing This Repo To GitHub

Trimarr is ready to be published from this directory.

Example:

```bash
git init
git add .
git commit -m "Initial Trimarr release"
git branch -M main
git remote add origin git@github.com:YOUR_USER/trimarr.git
git push -u origin main
```

## Notes

- Trimarr is currently designed around MKV remuxing workflows
- processing continues in the container even if you close the browser
- scheduled runs can scan first, process queued files, and stop after a configured end time
