# Backend configuration and operations

The API and worker use the same SQLite database. Keep both processes on the same host and do not copy the database
between hosts. SQLite runs in WAL mode. Take snapshots with the service command while the API and worker are running.

## Configuration

`serviceConfigRead` reads these variables. Secrets stay in the process environment or the service manager, never in
CLI arguments, project data, or generated lists.

Project environment R2 bucket names and public domains are runtime-managed through project settings and the API. They
are authoritative for project storage and are not startup allowlist entries. The endpoint, credentials, and service-level
operational R2 settings below remain environment-configured.

| Variable | Purpose |
| --- | --- |
| `ASSETS_ENVIRONMENT` | `development` or `production` |
| `ASSETS_API_HOST`, `ASSETS_API_PORT` | API bind address and port |
| `ASSETS_DATABASE_PATH` | SQLite database path |
| `ASSETS_WORKER_ID` | Stable worker identity for logs and leases |
| `CLOUDFLARE_ACCOUNT_ID` | R2 account identifier |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 credentials |
| `ASSETS_R2_ENDPOINT` | S3-compatible R2 endpoint |
| `ASSETS_R2_BUCKET` | Service-level operational/fallback bucket |
| `ASSETS_R2_PRIVATE_BUCKET`, `ASSETS_R2_PUBLIC_BUCKET` | Optional service-level operational private/public bucket split |
| `ASSETS_R2_PUBLIC_BASE_URL` | Service-level operational/fallback public domain |
| `ASSETS_R2_CUSTOM_DOMAIN_PROBE_KEY` | Optional immutable object used by `doctor` |
| `ASSETS_RCLONE_EXECUTABLE`, `ASSETS_RCLONE_TIMEOUT_MS` | rclone process settings |
| `ASSETS_RCLONE_REMOTE`, `ASSETS_RCLONE_BACKUP_ROOT` | Must be `gdrive_beta` and `backups` |
| `ASSETS_FFPROBE_EXECUTABLE` | Video metadata probe |
| `ASSETS_LEGACY_IMPORT_ROOTS` | Comma-separated, explicitly allowed import roots |

R2 uses separate private staging/source and public output namespaces. Public versioned and hash-named objects must keep
`public, max-age=31536000, immutable`. Private objects use `no-store`. `r2Prefix` is optional: leave it empty for a
dedicated bucket so objects use the bucket root, and retain a non-empty prefix when a shared bucket needs project
namespacing. The R2 doctor checks the service-level operational bucket and, when a probe key is configured, its public
custom domain.

### Remote project settings

Use the remote CLI to administer the project-specific storage binding and public base URL. These settings are
authoritative for the selected project environment; `ASSETS_R2_ENDPOINT`, credentials, and the service-level bucket
settings above remain process configuration.

```bash
bun run assets settings read [--project <id-or-name>] [--environment <development|production>] [--json]

bun run assets settings update [--project <id-or-name>] \
  --environment <development|production> \
  [--r2-bucket <bucket>] \
  [--r2-prefix <prefix>] \
  [--public-base-url <url>] \
  [--json]
```

Settings read and update require authenticated `assets.admin` access to the selected project. `read` defaults to the
project's default environment; `update` must name `development` or `production` explicitly and must provide at least
one setting option. The CLI reads the complete settings document, merges only the supplied fields into the selected
environment, and writes the complete document. Omitted fields and the other environment are preserved. An empty
prefix is valid and clears an existing prefix; quote it as `--r2-prefix ""`.

For separate development and production buckets, configure each environment independently at the bucket root:

```bash
bun run assets settings update --project my-site --environment development \
  --r2-bucket my-site-assets-dev --r2-prefix "" \
  --public-base-url https://dev-assets.example.com

bun run assets settings update --project my-site --environment production \
  --r2-bucket my-site-assets-prod --r2-prefix "" \
  --public-base-url https://assets.example.com
```

## Bulk project upload

The remote CLI reads `<root>/assets.config.json` for `assets diff [root]` and `assets upload-all [root]`. `root` defaults
to `.`. Each class maps to one directory, relative to the project root:

```json
{
  "image": "content/images",
  "video": null,
  "document": "content/documents",
  "font": "fonts"
}
```

The defaults are `images`, `videos`, `documents`, and `fonts`. Set a class to `null` to disable it. For one command,
use `--image-dir`, `--video-dir`, `--document-dir`, or `--font-dir`; use `--no-image-dir`, `--no-video-dir`,
`--no-document-dir`, or `--no-font-dir` to disable a class without editing the file. CLI overrides do not change
`assets.config.json`. Paths must stay inside the project root, and class directories must not overlap.

The scanner walks each configured directory recursively in deterministic lexical order. It rejects symlinks and special
files. A missing configured directory contributes no local entries. The configured class directory is stripped from the
logical path, but `sourcePath` remains project-relative. Thus `content/images/home/hero.png` is uploaded as image
`home/hero.png`, with source path `content/images/home/hero.png`. A logical path may contain at most three folders.

Documents use one byte-preserving `default` output. The accepted extensions and media types are:

| Extensions | Media type |
| --- | --- |
| `pdf` | `application/pdf` |
| `json` | `application/json` |
| `doc` | `application/msword` |
| `docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `xls` | `application/vnd.ms-excel` |
| `xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `xlsm` | `application/vnd.ms-excel.sheet.macroenabled.12` |
| `ppt` | `application/vnd.ms-powerpoint` |
| `pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| `odt` | `application/vnd.oasis.opendocument.text` |
| `ods` | `application/vnd.oasis.opendocument.spreadsheet` |
| `odp` | `application/vnd.oasis.opendocument.presentation` |
| `rtf` | `application/rtf` |
| `csv` | `text/csv` |
| `txt` | `text/plain` |

### Compare before uploading

Run a read-only comparison before changing the service:

```bash
bun run assets diff . --json
bun run assets diff . --document-dir content/documents --no-font-dir
```

The comparison uses normalized class, logical path, SHA-256, byte size, and media type. It reports these statuses:

- `new`: a local entry has no remote match.
- `changed`: the local fingerprint differs from the remote current source.
- `matching`: all compared identity and fingerprint fields match.
- `remote-only`: the remote entry has no local entry. This is informational; it does not delete the remote asset.
- `unsupported`: the local extension is not supported for its configured class.
- `conflict`: local or remote identities, paths, or targets conflict.

For matching entries, `diff` also reports whether the current source revision is eligible for local deletion. The command
does not upload or delete anything. It exits 0 only when every entry is `matching`; any other status returns exit 1.

### Upload and local cleanup

`upload-all` requires an integration note of 1 to 10,000 characters. A safe run is:

```bash
bun run assets upload-all . --integration-note "bulk upload" --dry-run --json
bun run assets upload-all . --integration-note "bulk upload" --wait
bun run assets upload-all . --integration-note "bulk upload" --wait --delete
```

The command uploads only `new` and `changed` entries. It skips matching entries for upload and takes no action for
remote-only entries. Unsupported or conflict local entries fail preflight and block the upload set before network
mutations. During an upload, independent failures do not stop later entries. Any failed entry makes the command exit
nonzero.

`--dry-run` loads and compares the local and remote manifests only. It neither uploads nor deletes. `--wait` polls each
uploaded workflow; without it, the command returns after upload completion is accepted. `--wait` and `--no-wait` cannot
be combined. `--delete` implies `--wait`, and `--delete --no-wait` is rejected.

With `--delete`, the CLI deletes a local file only after the service confirms eligibility for that exact source revision:
the revision has a verified backup, a successful workflow, output versions from that revision, and entries in the current
catalog. The CLI then re-reads the file identity and SHA-256 immediately before unlinking it. If the file changed, the
eligibility check failed, or unlinking failed, it keeps the file and reports a failure. It deletes files only, never
directories. These commands never perform remote deletion or bidirectional synchronization. A remote-only entry remains
remote.

`--json` writes one newline-terminated deterministic envelope to stdout. Human-readable failures go to stderr; JSON
failures go to stdout. A status mismatch or per-entry upload failure is returned in a success-shaped result with exit 1,
while command validation and transport failures use the failure envelope and a nonzero exit.

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
`gdrive_beta:backups/{organization-slug}/{project-slug}/assets/{logical-folders}/{source-revision-id}_{original-filename}`
before output publication. Omit the logical-folder segment when there are no logical folders. The worker uses `rclone
copy` or `copyto`, never `sync` or `bisync`.

```bash
bun run ops:sqlite-snapshot
bun run ops:sqlite-restore
bun run ops:reconcile
bash ops/doctor.sh
```

Inspect `gdrive_beta`, R2, and the SQLite receipt before retrying a failed publication. A notification or cleanup
failure does not undo a published catalog. Cleanup is retryable and must not regenerate output or allocate a version.

### Backup remote-path migration

Run this once against the production release that both treats receipt `remotePath` values as opaque and writes the new
canonical paths. Deploy that compatibility/new-writer release first and confirm its normal health checks:

```bash
bun run deploy
```

Run the migration on the production host as the `assets-service` user from the deployed release. Load the actual
production environment and rclone configuration; these values must not be replaced with development defaults:

```bash
sudo -u assets-service -H /bin/bash -lc 'exec /bin/bash'
```

Run the remaining commands in that service-user shell:

```bash
cd /home/assets-service/current
set -a
source /home/assets-service/.config/assets-service/assets-service.env
source /home/assets-service/.config/assets-service/prodctl-ports.env
set +a
export PATH="/home/assets-service/.bun/bin:/home/assets-service/.local/bin:/usr/local/bin:/usr/bin:/bin"
export ASSETS_DATABASE_PATH=/home/assets-service/data/assets.sqlite
export ASSETS_API_PORT="${PRODCTL_PORT_DEFAULT:?prodctl did not provide the default port}"
export RCLONE_CONFIG=/home/assets-service/.config/rclone/rclone.conf
test "$ASSETS_DATABASE_PATH" = /home/assets-service/data/assets.sqlite
test "$ASSETS_API_PORT" = "$PRODCTL_PORT_DEFAULT"
test "$ASSETS_RCLONE_REMOTE" = gdrive_beta
test "$ASSETS_RCLONE_BACKUP_ROOT" = backups
```

The API is published at `https://assets-service.contentoren.de` and listens on `127.0.0.1:$PRODCTL_PORT_DEFAULT`; both the worker and
migration CLI use `/home/assets-service/data/assets.sqlite` and the `gdrive_beta` remote with backup root `backups`.
The deployment command applies the release's database migrations; the backup migration command never changes the
database schema.

Take and retain a verified SQLite snapshot while the API and worker are still running. The snapshot command requires
these additional environment variables; use the production values and record the JSON `snapshotPath` and `receiptPath`
it returns:

```bash
export ASSETS_OPERATIONS_PROJECT_ID=<project-id>
export ASSETS_OPERATIONS_PREFIX=<operations-prefix>
export ASSETS_SQLITE_REMOTE_OBJECT_KEY=<snapshot-object-key>
bun run ops:sqlite-snapshot
```

After deployment and its health checks have completed, pause only the worker so the API remains available for the
migration CLI:

```bash
systemctl --user stop assets-service-worker.service
```

The migration command is dry-run by default; use the explicit flag for the preflight. It inventories verified receipts,
checks every canonical destination for existence, byte size, and SHA-256, and makes no copies or receipt changes. A
missing destination is expected for a receipt whose path still needs migration; it is reported in `missingItems` and is
still an automation gate. A missing destination for an already-canonical receipt, any mismatched destination, or any
collision is an unresolved finding. Verification first runs `rclone size`, then downloads the complete remote object
with `rclone copyto` to temporary disk and hashes every byte locally; it is not metadata-only. Allow for the corresponding
temporary disk space and network transfer.

The command writes JSON even when the report requires attention and returns exit 1 whenever work (`plannedReceiptIds`),
skips, missing objects, or collisions remain. For the preflight, inspect the JSON despite that expected exit 1 and
continue only when collisions are empty and every `missingItems` entry corresponds to planned work:

```bash
bun run ops:backup-migrate --dry-run
```

Execute the migration only after reviewing that report. The command copies with immutable semantics, verifies byte size
and SHA-256, and compare-and-swaps each receipt path. Record the returned `runId`:

```bash
bun run ops:backup-migrate --execute
```

An interrupted execution is resumable; use the recorded run id and keep the worker paused:

```bash
bun run ops:backup-migrate --execute --resume <run-id>
```

The journal fingerprint is stable after receipt paths are swapped, so an interrupted running run can also continue
without a run id; a blocked run never unblocks implicitly and requires its recorded `--resume` run id.

Verification is a second read-only dry-run; there is no separate verify flag. It re-inventories the receipts and verifies
every canonical destination again, including full-download byte-size and SHA-256 checks. Require
`"status":"planned"`, `"plannedReceiptIds":[]`, `"collisions":[]`, `"missingItems":[]`, `"skippedItems":[]`,
the expected `totalReceipts`, and exit 0 before resuming the worker. Check the worker is still paused immediately before
this verification:

```bash
bun run ops:backup-migrate --dry-run
```

If verification fails, do not delete either object layout. For a database rollback, stop both services, restore the
snapshot using the receipt produced above, and then start the API again. Set the exact paths from the saved snapshot
receipt; the restore command refuses an open database or active WAL sidecars:

```bash
systemctl --user stop assets-service-api.service assets-service-worker.service
export ASSETS_SQLITE_SNAPSHOT_PATH=<saved-snapshot-path>
export ASSETS_SQLITE_RECEIPT_PATH=<saved-receipt-path>
export ASSETS_SQLITE_RESTORE_TARGET="$ASSETS_DATABASE_PATH"
bun run ops:sqlite-restore
systemctl --user start assets-service-api.service
```

The snapshot restores the old receipt paths while both old and any copied new objects remain. Do not resume the worker
until the successful migration or rollback state has been verified. Restoring the snapshot also discards unrelated
SQLite changes made after the snapshot, so use that rollback only under the production maintenance decision. After
either path is verified, resume the worker with:

```bash
systemctl --user start assets-service-worker.service
```

Old-object cleanup is intentionally delayed and is **not automated** by this command or the service. After the validation
window, review old paths and perform any separately approved deletion operation; never treat migration completion as
permission to delete them.

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
