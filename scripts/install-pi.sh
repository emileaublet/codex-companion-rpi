#!/usr/bin/env bash
set -euo pipefail

repo_url=""
repo_branch="main"
bridge_url=""
bridge_token_file=""
bridge_token_stdin=0
companion_user="${SUDO_USER:-admin}"

usage() {
  echo "Usage: sudo $0 --repo URL --bridge-url URL --token-file PATH [--branch NAME] [--user NAME]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) repo_url="$2"; shift 2 ;;
    --branch) repo_branch="$2"; shift 2 ;;
    --bridge-url) bridge_url="$2"; shift 2 ;;
    --token-file) bridge_token_file="$2"; shift 2 ;;
    --token-stdin) bridge_token_stdin=1; shift ;;
    --user) companion_user="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

if [[ -z "$repo_url" || -z "$bridge_url" || ( -z "$bridge_token_file" && "$bridge_token_stdin" -ne 1 ) ]]; then
  usage
  exit 1
fi

if ! id "$companion_user" >/dev/null 2>&1; then
  echo "Unknown desktop user: $companion_user" >&2
  exit 1
fi

for command in git curl; do
  command -v "$command" >/dev/null 2>&1 || { echo "$command is required." >&2; exit 1; }
done

if ! command -v node >/dev/null 2>&1; then
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Node.js is required and apt-get is unavailable; install Node.js 18+ first." >&2
    exit 1
  fi
  echo "Node.js is not installed; installing the Raspberry Pi OS/Debian package."
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi

command -v node >/dev/null 2>&1 || { echo "Node.js installation failed." >&2; exit 1; }
node_path="$(command -v node)"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" -lt 18 ]]; then
  echo "Node.js 18 or newer is required; found $(node --version)." >&2
  exit 1
fi

if [[ "$bridge_token_stdin" -eq 1 ]]; then
  IFS= read -r bridge_token || true
else
  bridge_token="$(tr -d '\r\n' < "$bridge_token_file")"
fi

if [[ ${#bridge_token} -lt 32 || "$bridge_token" =~ [[:space:]] ]]; then
  echo "The bridge token must contain at least 32 non-whitespace characters." >&2
  exit 1
fi

install -d -m 0755 /etc/codex-companion /opt/codex-companion/releases
umask 077
printf 'INSTALL_ROOT=%q\nREPO_URL=%q\nREPO_BRANCH=%q\n' \
  "/opt/codex-companion" "$repo_url" "$repo_branch" \
  > /etc/codex-companion/update.env
printf 'PORT=4173\nBRIDGE_URL=%s\nMOCK_MODE=0\n' \
  "$bridge_url" \
  > /etc/codex-companion/pi.env
printf 'BRIDGE_TOKEN_FILE=/etc/codex-companion/bridge.token\n' >> /etc/codex-companion/pi.env
companion_group="$(id -gn "$companion_user")"
umask 077
printf '%s\n' "$bridge_token" > /etc/codex-companion/bridge.token
chown "$companion_user:$companion_group" /etc/codex-companion/bridge.token
chmod 0600 /etc/codex-companion/bridge.token /etc/codex-companion/*.env
unset bridge_token

COMPANION_UPDATE_CONFIG=/etc/codex-companion/update.env "$(dirname "$0")/update.sh"

sed -e "s#__COMPANION_USER__#$companion_user#g" -e "s#__NODE_BIN__#$node_path#g" \
  /opt/codex-companion/current/deploy/systemd/codex-companion.service \
  > /etc/systemd/system/codex-companion.service
install -m 0644 /opt/codex-companion/current/deploy/systemd/codex-companion-update.service \
  /etc/systemd/system/codex-companion-update.service
install -m 0644 /opt/codex-companion/current/deploy/systemd/codex-companion-update.timer \
  /etc/systemd/system/codex-companion-update.timer
install -m 0644 /opt/codex-companion/current/deploy/autostart/codex-companion.desktop \
  /etc/xdg/autostart/codex-companion.desktop

systemctl daemon-reload
systemctl enable --now codex-companion.service codex-companion-update.timer

echo
echo "Companion installed. Reboot into Raspberry Pi OS Desktop to enter kiosk mode."
echo "Bridge token installed in /etc/codex-companion/bridge.token (not displayed)."
