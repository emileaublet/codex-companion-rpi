#!/usr/bin/env bash
set -euo pipefail

companion_url="${COMPANION_URL:-http://127.0.0.1:4173}"

for _ in $(seq 1 60); do
  if curl --silent --fail --max-time 1 "${companion_url}/healthz" >/dev/null; then
    break
  fi
  sleep 1
done

if command -v chromium >/dev/null 2>&1; then
  browser="$(command -v chromium)"
elif command -v chromium-browser >/dev/null 2>&1; then
  browser="$(command -v chromium-browser)"
else
  echo "Chromium is required for kiosk mode." >&2
  exit 1
fi

exec "$browser" \
  --kiosk "$companion_url" \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-translate \
  --no-first-run \
  --start-fullscreen
