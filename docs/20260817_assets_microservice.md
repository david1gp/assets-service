# Assets microservice

## Goal

Implement the assets microservice specified by `../assets-optimizer/docs/20260817_assets_microservice.md` entirely in this repository, leaving `assets-optimizer` unchanged. Deliver schemas, models, API, worker, storage, authentication, processing, CLI, operations, tests, and finally the admin UI.

## Decisions

- Use Bun, TypeScript, Hono, Valibot, Drizzle SQLite/WAL, SolidJS, Vite, and Tailwind v4.
- Keep API, worker, remote CLI, local CLI, and UI as separate entrypoints over shared contracts.
- Use immutable R2 objects, mandatory `gdrive_beta` backup receipts before publication, deterministic catalogs, and durable SQLite jobs.
- Preserve image processing and generated-list semantics by reimplementing the required behavior without modifying or importing runtime code from `assets-optimizer`.
- Keep integrations behind interfaces so tests use local/in-memory adapters and production uses R2, rclone, Zitadel, and Telegram.
- Implement backend and operational boundaries before the UI.

## Approach

- Establish shared contracts and configuration first, then persistence and domain invariants.
- Add API/storage/auth and durable workflows in independently testable increments.
- Add processing, ingestion, mutation, catalog, CLI, recovery, and operational support on top of those boundaries.
- Build and browser-verify the admin SPA only after backend contracts are stable.

## Tasks

- [x] 1. Establish dependencies, project entrypoints, environment contracts, shared envelopes/errors, and core asset/job/catalog schemas.
- [x] 2. Implement Drizzle SQLite schema, migrations, connection setup, repositories, audit/outbox records, and persistence tests.
- [x] 3. Implement folder/key/version/hash invariants, processing adapters for image/video/font behavior, and deterministic list rendering.
- [x] 4. Implement R2 staging/public storage, signed upload intents, object verification, rclone backup, Zitadel auth/session/JWKS authorization, and integration doctors.
- [x] 5. Implement durable workflow/job leasing, ingestion, backup-before-publication, output generation, retries, dependencies, and recovery.
- [x] 6. Implement HTTP API routes for projects, uploads, assets, outputs, metadata, moves, deletion, jobs, backups, catalogs, imports, and health.
- [x] 7. Implement complete deletion, legacy import, Telegram outbox delivery, reconciliation, cleanup, and SQLite backup/restore.
- [x] 8. Implement remote and local CLIs with deterministic envelopes, catalog generation/checking, and local static reference counting.
- [x] 9. Complete backend integration, fixture, authorization, idempotency, and failure-ordering tests; document configuration and operations.
- [x] 10. Implement the SolidJS admin SPA, connect all required flows, and browser-verify responsive/accessibility states.
- [x] 11. Run the full repository checks and close remaining cross-boundary defects.

## Paths

- `src/schemas`, `src/config`, `src/domain`, `src/infrastructure`
- `src/asset`, `src/upload`, `src/output`, `src/metadata`, `src/catalog`, `src/project`, `src/import`
- `src/processing`, `src/workflow`, `src/backup`, `src/notification`, `src/authentication`, `src/deletion`, `src/reference-analysis`
- `src/api`, `src/api-client`, `src/cli`, `src/entrypoints`, `src/ui`
- `drizzle`, `ops`, `public`, `test`, `tests`

## Status

- Current: Task 11 complete.

## Current context

- Shared Valibot contracts, environment validation, service/worker/CLI entrypoints, deterministic envelopes, and stable library exports are implemented and passing checks.
- Drizzle SQLite tables, migration metadata, WAL/foreign-key initialization, transactional repositories, and persistence tests are implemented.
- Asset naming/version/hash invariants, byte-oriented image/video/font processing adapters, and deterministic canonical list rendering are implemented.
- R2 upload/storage, verified `gdrive_beta` backup, Zitadel authentication/authorization, durable sessions, and redacted integration doctors are implemented behind testable adapters.
- Durable resource-bounded jobs now cover verified ingestion, processing, backup-before-publication, immutable manifests, notification outbox events, cleanup, retries, and restart-safe idempotency.
- The authenticated Hono API now exposes project-scoped auth, project, upload, asset, output, metadata, move, deletion-request, workflow, backup, catalog, import-request, audit, and health contracts.
- Complete deletion, read-only legacy import, Telegram outbox delivery, safe reconciliation, and WAL-safe SQLite snapshot/restore operations are implemented and tested.
- Remote and local CLIs now provide deterministic command semantics, generated-list checking, immutable local outputs, and static reference counts without fallback between modes.
- Backend integration, authorization, idempotency, failure ordering, fixture coverage, and production operation documentation are complete.
- The SolidJS admin SPA now covers login/session/logout, projects, editable project/environment binding settings, the flat asset inventory, direct upload with workflow status, asset detail with an atomic output-set editor and public/backup/workflow/deletion detail, jobs, backups, catalog, imports, audit, and not-found handling; the built SPA is served from the API origin behind an API-safe fallback.
- A test-only seeded fixture server (`bun run fixture:server`, http://127.0.0.1:3021) serves the built SPA and a seeded API from one origin using an isolated database and a local session adapter; production authentication is unchanged.
- Uploads accept only media types that are detectable from bytes and processable; `image/svg+xml` is refused at the intent with HTTP 400, the file picker narrows to the same allowlist, and the form states the rule.
- Red, green, and amber colors come from app-owned tone helpers and class overrides that clear WCAG AA in both themes, without editing `./ui`.
- Destructive output-set saves and deletion requests both require an explicit confirmation checkbox, with an accessible reason for the disabled save.
- Deletion is presented as asynchronous: `Deletion requested`, a progress bar, and a marker on the asset list row. The detail page names the step count and the remote-object count separately, and the step total grows with the planned objects, so the bar never reads 100 percent while objects remain.
- The fixture seeds two independent failed workflows, one for retrying a single job and one for retrying a whole workflow, plus a half-finished deletion, so both retries land on `queued` without consuming each other.
- Toasts render in an app-owned `role="log"` viewport under `src/ui/toast`. The read-only library toaster puts `role="status"` on every `<li>`, which strips the `listitem` role and fails the axe `list` rule.
- `deletion-status` and its aliases answer 200 with `null` for an asset that was never asked to be deleted, so browsing produces no 404 traffic.
- An unauthenticated deep link keeps its full path and query through the login request, the PKCE state, and the callback redirect.
- The final audit confirmed that migration 0003 intentionally keeps deletion evidence after asset deletion, made Drizzle use `ASSETS_DATABASE_PATH`, aligned Caddy with the API host and published port, and made systemd installation render the current checkout path.
- The final checks found no app-owned secrets, screenshots, or debug artifacts. Build output and test databases were removed after verification. The read-only `./ui` copy was left unchanged. The assets-optimizer checkout was inspected read-only and was not changed by this work.
- The source specification and optimizer are read-only references; no task may modify `../assets-optimizer`.
