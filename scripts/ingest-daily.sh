#!/bin/bash
# Scheduled ingest wrapper (invoked by the launchd agent every morning).
# Enforces an "every other day" cadence via a timestamp guard, so the launchd
# job can fire daily but a full sync only runs when the last one was >~2 days
# ago. Run manually any time: `bash scripts/ingest-daily.sh`.
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

STAMP="$PROJECT_DIR/.ingest-last-run"
MIN_GAP=$((44 * 3600)) # ~2 days, with slack so a 48h-apart 6am run always passes
now=$(date +%s)

if [ -f "$STAMP" ]; then
  last=$(cat "$STAMP" 2>/dev/null || echo 0)
  if [ "$((now - last))" -lt "$MIN_GAP" ]; then
    echo "$(date '+%F %T'): skip — last sync $(((now - last) / 3600))h ago (<44h)."
    exit 0
  fi
fi

# launchd runs with a minimal environment; make node available. Prefer nvm's
# default so this keeps working across node upgrades, else rely on inherited PATH.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "$(date '+%F %T'): ERROR — npm not found on PATH; cannot ingest." >&2
  exit 127
fi

echo "$(date '+%F %T'): starting full ingest…"
if npm run ingest; then
  echo "$now" > "$STAMP"
  echo "$(date '+%F %T'): ingest complete."
else
  echo "$(date '+%F %T'): ingest FAILED — will retry next scheduled run." >&2
  exit 1
fi
