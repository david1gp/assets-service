#!/usr/bin/env bash
set -euo pipefail

ports_file="$HOME/.config/assets-service/prodctl-ports.env"
if [[ -f "$ports_file" ]]; then
	# shellcheck disable=SC1090
	source "$ports_file"
fi

: "${PRODCTL_PORT_DEFAULT:?prodctl did not provide the default port}"

environment_file="$HOME/.config/assets-service/assets-service.env"
rclone_config="$HOME/.config/rclone/rclone.conf"
data_directory="$HOME/data"
database_path="$data_directory/assets.sqlite"

if [[ ! -f "$environment_file" ]]; then
	echo "missing pre-provisioned environment file: $environment_file" >&2
	exit 1
fi
if [[ "$(stat -c '%a' "$environment_file")" != "600" ]]; then
	echo "environment file must have mode 600: $environment_file" >&2
	exit 1
fi
if [[ ! -f "$rclone_config" ]]; then
	echo "missing pre-provisioned rclone config: $rclone_config" >&2
	exit 1
fi
if [[ "$(stat -c '%a' "$rclone_config")" != "600" ]]; then
	echo "rclone config must have mode 600: $rclone_config" >&2
	exit 1
fi

install -d -m 700 "$data_directory"
chmod 700 "$data_directory"

export PATH="$HOME/.local/bin:$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin"
mkdir -p "$HOME/.local/bin"
ln -sfn "$HOME/.bun/bin/bun" "$HOME/.local/bin/node"
set -a
# shellcheck disable=SC1090
source "$environment_file"
set +a
export ASSETS_API_PORT="$PRODCTL_PORT_DEFAULT"
export ASSETS_DATABASE_PATH="$database_path"
export RCLONE_CONFIG="$rclone_config"

bun install --frozen-lockfile --ignore-scripts
bun run ops:migrate
bun run build
bun run vite:build
