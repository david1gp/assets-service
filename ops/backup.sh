#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.bun/bin:$PATH"
cd "$ROOT_DIR"
exec bun run src/entrypoints/sqlite-snapshot.ts "$@"
