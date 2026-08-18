#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"
USER_UNIT_DIR="$CONFIG_DIR/systemd/user"
UNITS=(
  "assets-service-api.service"
  "assets-service-worker.service"
)

mkdir -p "$USER_UNIT_DIR"
for unit in "${UNITS[@]}"; do
  target="$USER_UNIT_DIR/$unit"
  rm -f "$target"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == WorkingDirectory=* ]]; then
      printf 'WorkingDirectory=%s\n' "$ROOT_DIR"
    else
      printf '%s\n' "$line"
    fi
  done < "$SCRIPT_DIR/$unit" > "$target"
done
systemctl --user daemon-reload
systemctl --user enable --now "${UNITS[@]}"
