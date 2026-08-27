# Production configuration

The service has two long-running processes. The API listens on `ASSETS_API_PORT` and the worker claims jobs from the same SQLite database. Run them from the same release and mount the database directory into both processes.

Start with the checked-in example:

```bash
cp .env.example .env
chmod 600 .env
```

Replace every `CHANGE_ME` value. Keep `.env`, the R2 secret key, the Zitadel service-account credentials used by the rclone setup, and the Telegram bot token outside git. The example contains placeholders only.

## Required service values

| Variable | Use |
| --- | --- |
| `ASSETS_ENVIRONMENT` | `development` or `production`. |
| `ASSETS_API_HOST` | Public HTTPS API URL. Use the same host in the Zitadel redirect URI. |
| `ASSETS_API_PORT` | Local listener, normally `8787`. |
| `ASSETS_DATABASE_PATH` | SQLite file. In Compose use `/var/lib/assets-service/assets.sqlite`. |
| `ASSETS_WORKER_ID` | Stable, unique worker name. |
| `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 S3 credentials. Grant only the required bucket access. |
| `ASSETS_R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com`. |
| `ASSETS_R2_BUCKET`, `ASSETS_R2_PRIVATE_BUCKET`, `ASSETS_R2_PUBLIC_BUCKET` | Service-level operational/fallback bucket settings. |
| `ASSETS_R2_PUBLIC_BASE_URL` | Service-level operational/fallback public domain. |
| `ASSETS_RCLONE_REMOTE`, `ASSETS_RCLONE_BACKUP_ROOT` | Must remain `gdrive_beta` and `backups`. |
| `ASSETS_FFPROBE_EXECUTABLE` | Usually `ffprobe`. The production image includes it. |

Project environment R2 bucket names and public domains are configured in project settings through the API and resolved at
runtime. They do not need startup allowlisting or project-specific entries in the service environment. `r2Prefix` is
optional: use an empty value for a dedicated bucket and retain a non-empty value to namespace objects in a shared
bucket. The service-level R2 values above are used for operational tooling; they do not override project environment
settings.
`ASSETS_LEGACY_IMPORT_ROOTS` is an optional comma-separated list of absolute read-only import roots.

## R2 and rclone

Provision any service-level operational R2 bucket before starting the service. Project buckets and public domains are
runtime-managed through project settings/API and do not require startup allowlisting. The API and worker use the R2
endpoint directly. The worker also uses a local rclone configuration with a remote named exactly `gdrive_beta`:

```bash
rclone config
rclone lsd gdrive_beta:backups
```

In Compose, set `RCLONE_CONFIG_HOST_PATH` to a host file outside the repository. The worker mounts it read-only as `/run/assets-service/rclone.conf`. In systemd, set `RCLONE_CONFIG` in the service environment if the default rclone location is not suitable.

Asset backup commands are deliberately copy-only. The application rejects `sync` and `bisync` arguments before starting rclone. Do not grant the remote delete permissions unless the recovery policy requires them.

## Zitadel

Create a Zitadel OIDC application for the public API host. Set its redirect URI to:

```text
https://assets-api.example.test/api/v1/auth/callback
```

Set `ZITADEL_ISSUER`, `ZITADEL_CLIENT_ID`, `ZITADEL_REDIRECT_URI`, `ZITADEL_AUDIENCE`, `ZITADEL_ORGANIZATION_ID`, and `ZITADEL_PROJECT_ID`. Set `ZITADEL_SERVICE_ACCOUNT_CLIENT_ID` only when service-to-service bearer tokens are needed. The doctor checks HTTPS issuer discovery and JWKS reachability, but it does not print credentials.

## Telegram

Telegram delivery is optional. Set both `ASSETS_TELEGRAM_BOT_TOKEN` and `ASSETS_TELEGRAM_CHAT_ID` to enable the worker outbox dispatcher. Leaving both unset disables it. Setting only one is a configuration error. The worker stores failed deliveries and retries them; it does not block asset processing.

## Compose and systemd

Compose uses the named `assets-service-data` volume for SQLite and its WAL sidecars. Copy `.env.example` to `.env`, add the host rclone config, then use `compose.production.yml`.

The container listens on `8787`; set `ASSETS_PUBLISHED_API_PORT` when Caddy needs a different loopback port. The
checked-in Caddyfile reads `ASSETS_API_HOST` and `ASSETS_PUBLISHED_API_PORT`. Export those values before validating or
starting Caddy, for example with `set -a; source .env; set +a`.

The systemd units read `%h/.config/assets-service/assets-service.env`. Set `ASSETS_DATABASE_PATH` to a writable persistent host path, create that path with mode `700`, create the environment file with mode `600`, and run `ops/systemd/install.bash`. The units are separate, restart independently, and do not start the UI service.

The repository commits `bun.lock`; the production image installs dependencies with the frozen lockfile. Run
`bun run check` before `ops/deploy.sh --apply`. Validate the checked-in deployment files independently with
`bun run ops:validate`.
