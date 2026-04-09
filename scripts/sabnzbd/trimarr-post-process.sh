#!/bin/sh
set -u

TRIMARR_URL="${TRIMARR_URL:-}"
TRIMARR_API_KEY="${TRIMARR_API_KEY:-}"
TRIMARR_TIMEOUT="${TRIMARR_TIMEOUT:-30}"

if [ -z "$TRIMARR_URL" ] || [ -z "$TRIMARR_API_KEY" ]; then
  echo "Trimarr SAB hook skipped: TRIMARR_URL or TRIMARR_API_KEY is not set."
  exit 0
fi

json_escape() {
  printf '%s' "$1" | sed ':a;N;$!ba;s/\\/\\\\/g;s/"/\\"/g;s/\r/\\r/g;s/\n/\\n/g'
}

arg1="${1:-}"
arg2="${2:-}"
arg3="${3:-}"
arg4="${4:-}"
arg5="${5:-}"
arg6="${6:-}"
arg7="${7:-}"
arg8="${8:-}"

complete_dir="${SAB_COMPLETE_DIR:-$arg1}"
final_name="${SAB_FINAL_NAME:-${SAB_NZO_NAME:-$arg3}}"
job_name="${SAB_NZO_NAME:-$arg2}"
category="${SAB_CAT:-$arg5}"
postproc_status="${SAB_PP_STATUS:-$arg7}"
script_name="$(basename "$0")"

payload=$(
  printf '{'
  printf '"source":"sabnzbd",'
  printf '"script":"%s",' "$(json_escape "$script_name")"
  printf '"completeDir":"%s",' "$(json_escape "$complete_dir")"
  printf '"finalName":"%s",' "$(json_escape "$final_name")"
  printf '"jobName":"%s",' "$(json_escape "$job_name")"
  printf '"category":"%s",' "$(json_escape "$category")"
  printf '"postProcessStatus":"%s",' "$(json_escape "$postproc_status")"
  printf '"args":{"1":"%s","2":"%s","3":"%s","4":"%s","5":"%s","6":"%s","7":"%s","8":"%s"}' \
    "$(json_escape "$arg1")" \
    "$(json_escape "$arg2")" \
    "$(json_escape "$arg3")" \
    "$(json_escape "$arg4")" \
    "$(json_escape "$arg5")" \
    "$(json_escape "$arg6")" \
    "$(json_escape "$arg7")" \
    "$(json_escape "$arg8")"
  printf '}'
)

endpoint="${TRIMARR_URL%/}/api/webhooks/sab"

if curl -fsS --max-time "$TRIMARR_TIMEOUT" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $TRIMARR_API_KEY" \
  --data "$payload" \
  "$endpoint" >/dev/null; then
  echo "Trimarr SAB hook queued completed download from $complete_dir"
else
  echo "Trimarr SAB hook failed for $complete_dir"
fi

exit 0
