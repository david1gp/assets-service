#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.local/bin:$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin"
export ASSETS_API_BIND=127.0.0.1
export ASSETS_API_PORT="${PRODCTL_PORT_DEFAULT:?prodctl did not provide the default port}"
export ASSETS_DATABASE_PATH="$HOME/data/assets.sqlite"
export ASSETS_UI_DIRECTORY="$HOME/current/dist/ui"

exec bun run api
