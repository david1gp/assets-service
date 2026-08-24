#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.local/bin:$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin"
export ASSETS_DATABASE_PATH="$HOME/data/assets.sqlite"
export RCLONE_CONFIG="$HOME/.config/rclone/rclone.conf"

exec bun run worker
