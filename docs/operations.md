# Backend configuration and operations

The API and worker use the same SQLite database. Keep both processes on the same host and do not copy the database
between hosts. SQLite runs in WAL mode. Take snapshots with the service command while the API and worker are running.

## Configuration

`serviceConfigRead` reads these variables. Secrets stay in the process environment or the service manager, never in
CLI arguments, project data, or generated lists.

| Variable | Purpose |
| --- | --- |
| `ASSETS_ENVIRONMENT` | `development` or `production` |
| `ASSETS_API_HOST`, `ASSETS_API_PORT` | API bind address and port |
| `ASSETS_DATABASE_PATH` | SQLite database path |
| `ASSETS_WORKER_ID` | Stable worker identity for logs and leases |
| `CLOUDFLARE_ACCOUNT_ID` | R2 account identifier |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 credentials |
| `ASSETS_R2_ENDPOINT` | S3-compatible R2 endpoint |
| `ASSETS_R2_BUCKET` | Selected environment bucket |
| `ASSETS_R2_PRIVATE_BUCKET`, `ASSETS_R2_PUBLIC_BUCKET` | Optional private/public bucket split |
| `ASSETS_R2_DEVELOPMENT_BUCKET`, `ASSETS_R2_PRODUCTION_BUCKET` | Environment bucket overrides |
| `ASSETS_R2_PUBLIC_BASE_URL` | Selected public custom domain |
| `ASSETS_R2_DEVELOPMENT_PUBLIC_BASE_URL`, `ASSETS_R2_PRODUCTION_PUBLIC_BASE_URL` | Environment domain overrides |
| `ASSETS_R2_CUSTOM_DOMAIN_PROBE_KEY` | Optional immutable object used by `doctor` |
| `ASSETS_RCLONE_EXECUTABLE`, `ASSETS_RCLONE_TIMEOUT_MS` | rclone process settings |
| `ASSETS_RCLONE_REMOTE`, `ASSETS_RCLONE_BACKUP_ROOT` | Must be `gdrive_beta` and `backups` |
| `ASSETS_FFPROBE_EXECUTABLE` | Video metadata probe |
| `ASSETS_LEGACY_IMPORT_ROOTS` | Comma-separated, explicitly allowed import roots |

R2 uses separate private staging/source and public output namespaces. Public versioned and hash-named objects must keep
`public, max-age=31536000, immutable`. Private objects use `no-store`. The R2 doctor checks the configured bucket and,
when a probe key is configured, the public custom domain.

## Process lifecycle

Run the API and worker separately:

```bash
bun run api
bun run worker
```

The worker claims short-lived leases. A stopped worker leaves running jobs for lease recovery. Restarting the worker is
safe. Handlers reuse immutable objects, backup receipts, output versions, outbox event IDs, and deletion progress.

## Backups and recovery

Every accepted source revision needs a verified append-only backup below
`gdrive_beta:backups/{organization-slug}/assets/{project-slug}` before output publication. The worker uses `rclone
copy` or `copyto`, never `sync` or `bisync`.

```bash
bun run ops:sqlite-snapshot
bun run ops:sqlite-restore
bun run ops:reconcile
bash ops/doctor.sh
```

Inspect `gdrive_beta`, R2, and the SQLite receipt before retrying a failed publication. A notification or cleanup
failure does not undo a published catalog. Cleanup is retryable and must not regenerate output or allocate a version.

## Deterministic checks

Use local adapters in tests. They cover R2 namespaces, rclone receipts, Zitadel grants, and Telegram delivery without
credentials. Generated lists are UTF-8/LF files and `--check` returns exit code 1 for any byte difference:

```bash
bun run assets lists --check --dir src/app/assets
bun run assets-local lists --check
bun run assets-local references --include src
```

Reference counts are local advisory data. The deletion workflow never reads them. Complete deletion removes current and
historical service records, catalog entries, manifests, staging/source/output objects, backup objects, and receipts. A
partial deletion keeps its progress record so a new worker can resume it.
