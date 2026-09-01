#!/usr/bin/env bash
set -euo pipefail

companion_url="${COMPANION_URL:-http://127.0.0.1:4173}"

# Raspberry Pi OS may invoke this from both labwc autostart and the XDG
# autostart compatibility layer. Keep one browser instance per desktop.
if command -v flock >/dev/null 2>&1; then
  lock_file="${XDG_RUNTIME_DIR:-/tmp}/codex-companion-kiosk.lock"
  exec 9>"$lock_file"
  flock -n 9 || exit 0
fi

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
