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
