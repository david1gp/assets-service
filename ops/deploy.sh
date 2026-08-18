#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ASSETS_COMPOSE_FILE:-$ROOT_DIR/compose.production.yml}"
ENV_FILE="${ASSETS_ENV_FILE:-$ROOT_DIR/.env}"

cd "$ROOT_DIR"
export PATH="$HOME/.bun/bin:$PATH"

echo "Running the assets-service deployment preflight."
bun run check

if [[ "${1:-}" != "--apply" ]]; then
  echo "Preflight passed. Run '$0 --apply' with a configured $ENV_FILE to deploy."
  exit 0
fi

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Missing environment file: %s\n' "$ENV_FILE" >&2
  exit 1
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build api worker
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm --no-deps api bun run ops:migrate
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d api worker
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
