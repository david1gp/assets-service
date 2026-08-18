#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
echo "Restore requires the service to be stopped and ASSETS_SQLITE_RESTORE_TARGET to be set."
exec bun run src/entrypoints/sqlite-restore.ts "$@"
