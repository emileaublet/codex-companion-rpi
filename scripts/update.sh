#!/usr/bin/env bash
set -euo pipefail

config_file="${COMPANION_UPDATE_CONFIG:-/etc/codex-companion/update.env}"
if [[ ! -r "$config_file" ]]; then
  echo "Missing update configuration: $config_file" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$config_file"

: "${INSTALL_ROOT:=/opt/codex-companion}"
: "${REPO_URL:?REPO_URL is required}"
: "${REPO_BRANCH:=main}"

case "$INSTALL_ROOT" in
  /opt/codex-companion|/srv/codex-companion) ;;
  *) echo "Refusing unexpected INSTALL_ROOT: $INSTALL_ROOT" >&2; exit 1 ;;
esac

releases_dir="$INSTALL_ROOT/releases"
mkdir -p "$releases_dir"
incoming_dir="$(mktemp -d "$releases_dir/.incoming.XXXXXX")"

cleanup() {
  if [[ -n "${incoming_dir:-}" && "$incoming_dir" == "$releases_dir"/.incoming.* ]]; then
    rm -rf -- "$incoming_dir"
  fi
}
trap cleanup EXIT

git clone --quiet --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$incoming_dir/repo"
git -C "$incoming_dir/repo" fsck --strict --no-progress >/dev/null
if [[ -n "$(git -C "$incoming_dir/repo" status --porcelain)" ]]; then
  echo "Downloaded release is not clean." >&2
  exit 1
fi
new_sha="$(git -C "$incoming_dir/repo" rev-parse HEAD)"
old_sha=""

if [[ -L "$INSTALL_ROOT/current" && -d "$INSTALL_ROOT/current/.git" ]]; then
  old_sha="$(git -C "$INSTALL_ROOT/current" rev-parse HEAD 2>/dev/null || true)"
fi

if [[ "$new_sha" == "$old_sha" ]]; then
  echo "Already current at ${new_sha:0:12}."
  exit 0
fi

node "$incoming_dir/repo/scripts/verify.mjs"

release_dir="$releases_dir/$new_sha"
if [[ ! -d "$release_dir" ]]; then
  mv "$incoming_dir/repo" "$release_dir"
fi

next_link="$INSTALL_ROOT/.current-next"
ln -sfn "$release_dir" "$next_link"
mv -Tf "$next_link" "$INSTALL_ROOT/current"

systemctl try-restart codex-companion.service || true
echo "Updated companion from ${old_sha:-none} to $new_sha."

if [[ -f "$release_dir/deploy/REBOOT_REQUIRED" ]]; then
  echo "This release requests a reboot."
  systemctl reboot
fi
