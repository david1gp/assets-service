#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_SCRIPT="${CONTENTOREN_DEPLOY_SCRIPT:-/home/david/leo/contentoren-server/assets-service/scripts/deploy.sh}"
SOURCE_DIR="${ASSETS_SOURCE_DIR:-$ROOT_DIR}"

if [[ ! -f "$DEPLOY_SCRIPT" ]]; then
  printf 'Contentoren deployment wrapper not found: %s\n' "$DEPLOY_SCRIPT" >&2
  exit 1
fi

export ASSETS_SOURCE_DIR="$SOURCE_DIR"
if [[ $# -eq 2 && ( "$2" == "-h" || "$2" == "--help" ) ]]; then
  set -- "$2"
fi
exec bash -- "$DEPLOY_SCRIPT" "$@"
