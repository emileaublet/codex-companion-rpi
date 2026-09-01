#!/usr/bin/env bash
set -euo pipefail

bridge_port="4174"
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
token_file="${BRIDGE_TOKEN_FILE:-$HOME/Library/Application Support/CodexCompanion/bridge.token}"

usage() {
  echo "Usage: $0 [--token-file PATH] [--port PORT]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token-file) token_file="$2"; shift 2 ;;
    --port) bridge_port="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$OSTYPE" != darwin* ]]; then
  echo "This installer is for macOS." >&2
  exit 1
fi

for command in node codex openssl; do
  command -v "$command" >/dev/null 2>&1 || { echo "$command is required." >&2; exit 1; }
done

node_path="$(command -v node)"
codex_path="$(command -v codex)"
launch_agents="$HOME/Library/LaunchAgents"
logs_dir="$HOME/Library/Logs/CodexCompanion"
plist="$launch_agents/com.aublet.codex-companion-bridge.plist"
mkdir -p "$launch_agents" "$logs_dir" "$(dirname "$token_file")"

if [[ ! -s "$token_file" ]]; then
  umask 077
  openssl rand -hex 32 > "$token_file"
fi

chmod 0600 "$token_file"
if [[ "$(wc -c < "$token_file")" -lt 32 ]]; then
  echo "The bridge token file is too short." >&2
  exit 1
fi

cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.aublet.codex-companion-bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>$node_path</string>
    <string>$project_dir/apps/mac-bridge/server.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$project_dir</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>BRIDGE_HOST</key><string>0.0.0.0</string>
    <key>BRIDGE_PORT</key><string>$bridge_port</string>
    <key>BRIDGE_TOKEN_FILE</key><string>$token_file</string>
    <key>CODEX_BIN</key><string>$codex_path</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$logs_dir/bridge.log</string>
  <key>StandardErrorPath</key><string>$logs_dir/bridge-error.log</string>
</dict>
</plist>
PLIST

plutil -lint "$plist"
launchctl bootout "gui/$(id -u)" "$plist" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"

echo "Mac bridge installed on port $bridge_port; token stored at $token_file."
echo "If macOS asks, allow incoming connections on your private network."
