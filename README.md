# @adaptive-ds/assets-service

Process and serve site media from one Bun package. Images, video, fonts, and documents go in, sized and hashed files come out.

The service exposes shared contracts for its API, worker, and remote CLI. Media processing and persistence are added behind those contracts.

## Install

```bash
bun add @adaptive-ds/assets-service
```

## Scripts

```bash
bun run api      # API process
bun run worker   # worker process
bun run assets   # remote CLI
bun run ops:doctor # production integration checks
bun run ops:migrate # apply SQLite migrations
bun run ops:backup # create and verify an R2 SQLite snapshot
bun run ops:restore # restore a verified SQLite snapshot
bun run ops:reconcile # plan or apply guarded cleanup
bun test         # Bun tests
bun run build    # emit dist/
bun run format   # Biome
bun run release  # git-cliff changelog + tag
```

## Remote CLI

`assets` talks only to the configured service. It never switches to local processing after a request fails.

```bash
bun run assets --help
bun run assets doctor --environment development
bun run assets upload ./card.png --path home/card.png --integration-note "Home card"
bun run assets list --kind image --include outputs,metadata,history
bun run assets lists --dir src/app/assets
bun run assets lists --check --dir src/app/assets
```

### Organization and environment selection

The CLI uses the global organization configuration at `~/.config/assets-service/config.json` (or the equivalent
`XDG_CONFIG_HOME` path). Its schema contains the existing `david` and `contentoren` organizations and optional directory
mappings:

```json
{
  "organizations": {
    "david": {
      "id": "<david-organization-id>",
      "name": "David",
      "slug": "david"
    },
    "contentoren": {
      "id": "<contentoren-organization-id>",
      "name": "Contentoren",
      "slug": "contentoren"
    }
  },
  "directoryMappings": {
    "~/personal": "david",
    "~/leo": "contentoren"
  }
}
```

Only `david` and `contentoren` may be configured. `~/adaptive` remains unmapped. Mappings use normalized containing
directories, require path boundaries, and choose the longest matching mapping. The legacy
`~/.config/assets/config.json` path is used only when the canonical file is absent; an invalid canonical file does not
fall back. The fallback accepts this organization schema, while an old saved CLI configuration there is ignored for
organization selection.

Put a project override in the selected `.env` file:

```dotenv
ASSETS_ORGANIZATION=contentoren
```

The environment file is selected in this order: `--env-file <path>`, `ASSETS_ENV_FILE`, `<command-root>/.env`, then
`$PWD/.env`. Explicit paths are relative to the working directory and must exist; a default `.env` is optional. The CLI
does not search ancestor directories. For organization selection, the precise precedence is `--organization`,
`ASSETS_ORGANIZATION` in the selected `.env`, process `ASSETS_ORGANIZATION`, the global directory mapping, then
unrestricted resolution. Organization selectors may be a configured key, ID, or slug. `ZITADEL_ORGANIZATION_ID` is
reserved for server authentication and is not used for CLI selection.

```bash
bun run assets diff ./site --env-file ./env/site.env
ASSETS_ENV_FILE=./env/site.env bun run assets diff ./site
bun run assets config show ./site
bun run assets config show ./site --json
```

`assets config show [root] [--json]` defaults `root` to `.` and reports the effective values, source paths, load state,
and source of each value. JSON and human output omit credentials and session secrets; API URLs are sanitized.

### Remote project settings

Administrators can read or update the R2 binding and public base URL for one project environment through the remote
service:

```bash
bun run assets settings read [--project <id-or-name>] [--environment <development|production>] [--json]

bun run assets settings update [--project <id-or-name>] \
  --environment <development|production> \
  [--r2-bucket <bucket>] \
  [--r2-prefix <prefix>] \
  [--public-base-url <url>] \
  [--json]
```

`read` uses the project's default environment when `--environment` is omitted. `update` requires an explicit
`--environment` and at least one setting option. Both commands require authenticated access with the `admin`
role for the selected project. `--project` accepts a project ID or name; otherwise normal project resolution applies
(`ASSETS_PROJECT`, saved CLI configuration, or the sole accessible project).

### Remote project registration

Organization administrators and authorized automation can register a project and its complete initial service
configuration through the authenticated remote CLI. The command requires one explicit binding and both environment
bindings. It requires either an authenticated human session whose principal has organization-admin authority for the
selected organization, or a bearer token corresponding to the exact machine identity configured as the Assets
Service project provisioner (via `ZITADEL_PROJECT_PROVISIONER_SUBJECT_ID`) in the same organization. Ordinary
service credentials without the dedicated provisioner subject are rejected. When registered by a human session,
the administrator is recorded as an initial `project_grants` database row for the new project; machine provisioners
record the provisioner subject ID. Runtime authorization remains based on the authenticated Zitadel claims, not that
database row. The `--zitadel-project-id` value records the existing binding only; this command does not provision
anything in Zitadel.

For human interactive sessions, use `ASSETS_SESSION_COOKIE`. For automated machine provisioning, authenticate via
protected token sources: `ASSETS_TOKEN` or `ASSETS_ACCESS_TOKEN` in the environment or a mode-`0600` `.env` file, or
a stored session written by `echo $TOKEN | bun run assets auth login --token-stdin` (or `--session <path>`). Tokens
are never accepted as command-line arguments. It creates a missing configured database organization or attaches the
project to the matching existing organization. Repeating the exact request returns the existing registration;
different values for an existing registration are rejected.

```bash
bun run assets projects create \
  --organization <key|id|slug> \
  --name <name> \
  --slug <slug> \
  --default-environment <development|production> \
  --service-project-id <id> \
  --zitadel-project-id <id> \
  --development-r2-bucket <bucket> \
  --development-r2-prefix <prefix> \
  --development-public-base-url <url> \
  --production-r2-bucket <bucket> \
  --production-r2-prefix <prefix> \
  --production-public-base-url <url> \
  [--json]
```

The command does not use `--project` or `--environment`: project and default-environment values must be supplied
explicitly. Quote an empty prefix (`--development-r2-prefix ""`) when a dedicated bucket should use its root.

Updates are targeted merges. The CLI first reads the complete project settings document, changes only the selected
environment, and writes the complete document back. Omitted fields and all other environments remain unchanged. The
R2 prefix is optional; pass an explicitly empty value to clear it: `--r2-prefix ""`.

For dedicated buckets, leave the prefix empty so objects use each bucket's root:

```bash
bun run assets settings update --project my-site --environment development \
  --r2-bucket my-site-assets-dev --r2-prefix "" \
  --public-base-url https://dev-assets.example.com

bun run assets settings update --project my-site --environment production \
  --r2-bucket my-site-assets-prod --r2-prefix "" \
  --public-base-url https://assets.example.com
```

### R2 bucket and domain migration

Use `migrate` to move one project environment to a different R2 bucket and/or prefix, change its public base URL, and
optionally provision a custom R2 domain. It requires authenticated `admin` access to the selected project. The command
plans by default and makes no provisioning, object copies, or settings changes:

```bash
bun run assets settings migrate --project <id-or-name> \
  --environment <development|production> \
  [--r2-bucket <bucket>] \
  [--r2-prefix <prefix>] \
  [--public-base-url <url>] \
  [--create-bucket] \
  [--custom-domain <hostname>] \
  [--zone-id <id>] \
  [--wrangler-profile <name>] \
  [--apply] \
  [--wait] \
  [--no-wait] \
  [--poll-interval <milliseconds>] \
  [--json]
```

The target bucket, prefix, and public base URL default to the selected environment's current values when their options
are omitted. At least one target field must change. `--r2-prefix` is optional and accepts an explicitly empty value to
use the bucket root: `--r2-prefix ""`. `--public-base-url` must be a valid URL. A custom domain must be a bare
hostname; `--zone-id` is required with `--custom-domain` and cannot be used without it. When `--custom-domain` is
provided without `--public-base-url`, the public base URL becomes `https://<hostname>`. If both are provided, the URL
must be exactly `https://<hostname>`.

`--apply` first obtains the plan, then runs Wrangler provisioning when requested, and starts the durable storage
migration. `--create-bucket` requires `--r2-bucket`; it creates the bucket only when Wrangler confirms that it is
missing. `--custom-domain` checks the existing attachment, attaches it with Wrangler when absent, and verifies it.
`--wrangler-profile` selects the Wrangler profile and is valid only with `--create-bucket` or `--custom-domain`.
Without a provisioning option, `--apply` does not invoke Wrangler. Wrangler must be installed and authenticated for
any requested provisioning.

By default, `--apply` returns after the migration is accepted. `--no-wait` makes that behavior explicit. `--wait`
requires `--apply`, cannot be combined with `--no-wait`, and polls migration status up to 60 times; the default interval
is 1,000 milliseconds. `--poll-interval` requires `--wait` and accepts 0 through 3,600,000 milliseconds. A waited
migration exits 0 only for `succeeded`; `failed`, `cancelled`, a polling timeout, or a status error exits nonzero. The
status and migration identifier are included in the result; use `--json` for the deterministic JSON envelope.

The service can copy objects only between buckets reachable through its configured R2 account and credentials. A
Wrangler profile does not enable cross-account object transfer; cross-account migration is unsupported. For a storage
change, the workflow probes the target, inventories and immutably copies the source namespaces, verifies the complete
destination and public URL, and changes project settings last. A domain-only change performs no object copy.

The idempotency key is derived from the project, environment, and requested target binding. Repeating the same command
reuses queued, running, and succeeded attempts. Failed or cancelled attempts remain in history; repeating the same
command after one creates a new numbered retry attempt. Concurrent storage-setting changes or another active migration
can block the start. A failure before cutover leaves the source settings authoritative; any already-copied destination
objects remain. There is no automatic rollback or cleanup. For a completed cutover, any rollback must be separately
approved and restore the recorded source bucket, prefix, and public base URL; the migration itself never deletes source
objects or destination objects.

### Bulk project upload

`assets diff [root]` and `assets upload-all [root]` default `root` to `.`. They scan the configured `image`, `video`,
`document`, and `font` directories recursively. Without a project configuration, those directories are `images`,
`videos`, `documents`, and `fonts`.

Create `<root>/assets.config.json` to change or disable a class. Values are project-root-relative directories; `null`
disables a class:

```json
{
  "image": "content/images",
  "video": null,
  "document": "content/documents",
  "font": "fonts"
}
```

Use `--image-dir`, `--video-dir`, `--document-dir`, or `--font-dir` to override one mapping for one invocation. Use
`--no-image-dir`, `--no-video-dir`, `--no-document-dir`, or `--no-font-dir` to disable it. Class roots are removed
from logical asset paths, while `sourcePath` keeps the project-relative path. For example,
`content/images/home/hero.png` maps to logical path `home/hero.png`.

Documents are byte-preserving passthrough assets. Supported extensions are `pdf`, `json`, `doc`, `docx`, `xls`,
`xlsx`, `xlsm`, `ppt`, `pptx`, `odt`, `ods`, `odp`, `rtf`, `csv`, and `txt`.

```bash
bun run assets diff . --json
bun run assets upload-all . --integration-note "bulk upload" --dry-run --json
bun run assets upload-all . --integration-note "bulk upload" --wait
```

`diff` is read-only and reports `new`, `changed`, `matching`, `remote-only`, `unsupported`, and `conflict` entries.
`upload-all` uploads source bytes only for `new` and `changed` entries; matching entries are skipped for upload and may
reconcile a stale canonical service-managed image default. `--integration-note` is required and must contain 1 to 10,000
characters. `--delete` implies `--wait` and removes a local file only after the service
proves that the exact source revision is backed up, processed successfully, published, and in the current catalog.
The bulk commands recheck the file immediately before unlinking it, never delete directories, and never delete remote
assets.

`--json` writes one newline-terminated deterministic envelope to stdout. `diff` exits 0 only when every entry is
`matching`; `upload-all` exits nonzero when an entry fails. `--dry-run` reports planned reconciliation and performs no
mutation, upload, or delete. `--wait` and `--no-wait` cannot be combined. `--delete --no-wait` is rejected.

Use `ASSETS_API_URL`, `ASSETS_TOKEN`, `ASSETS_PROJECT`, and `ASSETS_ENVIRONMENT` for non-interactive calls. `--json`
writes one newline-terminated deterministic envelope to stdout. Failed commands return a nonzero exit code.

Project selection uses `--project`, `ASSETS_PROJECT` (or legacy `ASSETS_PROJECT_ID`), saved CLI configuration, the exact
`name` in the bulk command root's `package.json` (never the directory basename), and finally the sole accessible project.
`ASSETS_PROJECT` and `ASSETS_ENVIRONMENT` may come from the selected environment file; process values take precedence
over values from that file. If more than one project is accessible and no identity matches, use `--project <name>` or
set `ASSETS_PROJECT`; if none are accessible, verify the API URL, token, and access.

The remote CLI generates `imageList.ts`, `videoList.ts`, `documentList.ts`, and `fontList.ts`, including empty lists. `lists --check` compares
exact UTF-8/LF bytes and exits with code 1 when a file differs.

## Production

Copy `.env.example` to `.env` and replace its placeholders. `compose.production.yml` runs separate API and worker
containers with a persistent SQLite volume. `ops/caddy/assets-service.Caddyfile` is a Caddy reverse-proxy example,
and `ops/systemd` contains separate user units for hosts that do not use Compose.

For the Contentoren production deployment, the package scripts are the canonical command interface:

| Command | Action |
| --- | --- |
| `bun run frontend:build`<br>`bun run backend:build` | Build only the frontend `dist/ui` or backend artifacts. |
| `bun run frontend:upload`<br>`bun run backend:upload` | Upload an existing frontend build or backend source/runtime files. |
| `bun run frontend:deploy`<br>`bun run backend:deploy` | Build, then upload one component without shared activation. |
| `bun run deploy` | Deploy backend first, then frontend, and run migrations, service/proxy activation, and health checks once. |

Provisioning remains separate. The package commands delegate through `ops/deploy-contentoren.sh`; see the Contentoren
deployment README for host-specific setup.

Read [production configuration](docs/production-configuration.md) before provisioning R2, rclone, Zitadel, or
Telegram. [Operations](docs/operations.md) covers health checks, migrations, backups, restore, reconciliation,
deploys, and recovery.

## Links

- code: https://github.com/david1gp/assets-service
- npm: https://www.npmjs.com/package/@adaptive-ds/assets-service
- issues: https://github.com/david1gp/assets-service/issues

## License

MIT
