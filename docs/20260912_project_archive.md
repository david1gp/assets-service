# Project archive and unarchive

## Goal

Provide project archive and unarchive library functions and CLI commands. Archive retains project metadata and Google Drive backups while removing all current and historical project data from R2, removing custom domains from buckets being deleted, and deleting dedicated buckets. Unarchive recreates production storage, fresh bucket credentials, custom domains, every source revision, and optimized current assets. The web UI only adds an admin-only, off-by-default **Show archived** toggle; archive actions remain outside the web UI. Production verification archives Template and leaves it archived.

## Decisions

- Persist lifecycle states `active`, `archiving`, `archived`, and `unarchiving`; retries resume idempotently without a separate progress or failure model.
- Add structured phase/error logging sufficient to diagnose retries, while redacting every credential and secret.
- Preserve SQLite project, asset, revision, output, audit, and backup-receipt metadata. Preserve the shared `gdrive_beta` Google Drive remote and all backup objects.
- Archive requires matching verified Google Drive receipts for every source revision but does not download or checksum Drive objects during archive preflight.
- Delete every known current and historical project R2 prefix. Never delete a shared bucket; remove only the archived project's prefixes from it.
- Delete a root bucket only when all persisted current and historical bindings prove it belongs exclusively to the project. Missing objects or buckets are idempotent successes.
- Before deleting a dedicated bucket, remove its configured custom-domain bindings. Unarchive recreates and verifies those bindings after recreating the bucket.
- Restore every source revision into the production/default environment. Regenerate and verify current optimized outputs for every asset in that environment.
- Cloudflare account ID and API token are per-user, request-scoped inputs supplied by the CLI from its environment or explicitly to the library. They are never persisted.
- Use the request-scoped Cloudflare token to create bucket-scoped R2 access-key/secret credentials. Persist those credentials encrypted, with their revocation identifier, for use by the API and worker until the bucket is removed.
- Use one server-side master encryption key for stored bucket credentials; this is service configuration, not per-user state.
- Revoke and delete stored bucket credentials when their bucket is deleted. Unarchive creates and stores fresh credentials.
- Resolve R2 data-plane access by bucket from persisted credentials rather than a single service-wide R2 account.
- Assume Wrangler is installed globally through Bun. Invoke it with an explicit request-scoped Cloudflare environment for bucket and custom-domain control-plane operations.
- Archive/unarchive API and CLI operations are admin-only. The web UI does not expose archive/unarchive buttons.
- **Show archived** is visible only to authorized admins, disabled by default, URL-backed, and never available in contributor view.
- Template remains archived after production verification.

## Approach

- Persist complete storage history, custom-domain restoration metadata, and encrypted per-bucket R2 credentials.
- Add request-scoped Cloudflare control-plane adapters for bucket, credential, and custom-domain lifecycle, plus bucket-scoped R2 adapter resolution for API and worker operations.
- Rework archive/unarchive orchestration around all revisions, historical locations, credential lifecycle, domain lifecycle, idempotent retries, and redacted structured logging.
- Expose narrow library/API contracts and CLI commands that automatically read caller Cloudflare credentials from environment variables.
- Keep archived filtering enforced server-side and retain the admin-only UI visibility toggle without web mutation actions.
- Verify focused and full tests, browser visibility behavior, commit/push, deploy, and the complete production Template archive.

## Tasks

- [x] 1. Finalize persistence for historical storage locations, custom-domain metadata, and encrypted bucket credentials, including migrations/backfills and repository tests.
- [x] 2. Implement request-scoped Cloudflare account/API-token handling, bucket-scoped R2 credential creation/revocation, Bun-global Wrangler bucket/domain operations, secret redaction, and focused adapter tests.
- [x] 3. Replace service-wide R2 access in archive/unarchive and processing with bucket-scoped credential resolution usable by both API and worker; cover existing-project credential bootstrap and retries.
- [x] 4. Rework archive to require verified receipts for every source revision without reading Drive bytes, clean every current/historical R2 prefix, remove domains for deleted buckets, delete only dedicated buckets, revoke credentials, and emit structured phase/error logs.
- [x] 5. Rework unarchive to recreate production buckets and fresh credentials, reattach/verify custom domains, restore every source revision from `gdrive_beta`, regenerate/verify current optimized assets, and emit structured phase/error logs.
- [x] 6. Update public library inputs, authenticated API contracts, and CLI archive/unarchive commands so Cloudflare credentials are explicit library inputs and automatically sourced from CLI environment variables; keep web mutation actions absent.
- [x] 7. Retain and verify default archived filtering, admin-only **Show archived**, archived status presentation, and contributor exclusion in API and web UI.
- [x] 8. Run focused integration tests, full checks, operations validation, and browser verification; fix only feature-related defects.
- [x] 9. Use the commits skill to split, commit, and push the completed implementation.
- [x] 10. Deploy production, verify migrations, global Wrangler availability, service health, and a non-destructive Cloudflare credential/bucket/domain capability check.
- [x] 11. Archive production Template through the deployed CLI and verify it remains archived, is hidden by default, is visible with **Show archived**, is absent to contributors, has no current or historical R2 data or deleted-bucket domain bindings, retains SQLite metadata, and retains Google Drive backups.
- [x] 12. Backfill encrypted bucket-scoped R2 credentials once per distinct live current/historical bucket with dry-run, retries, redaction, and CLI Cloudflare environment inputs.
- [x] 13. Review and harden task-12 bucket credential backfill correctness and security, run focused/full repository checks, fix only backfill defects, commit/push, and do not deploy or run production.
- [ ] 14. Deploy and run the production credential backfill, repair any unusable generated credentials, verify every distinct live bucket through persisted credentials, prove idempotence, and confirm Template remains archived.

## Current context

- Tasks 1–13 complete. Task-14 review hardened credential repair with durable encrypted rollback state, per-bucket leased claims across processes, create→persist/verify→revoke ordering, retry-safe cleanup, orphan revocation, authorization coverage, redaction, and shared-bucket dedupe. Commits `e79c0cb` and `19f2b75` are pushed; deployment and migration completed at SHA `19f2b751ecee14468d1fec302a7b92c5c83d8ff0`, with API and worker active and live/ready health checks passing. The production repair command has intentionally not been run. Remaining: run production repair, verify every distinct live bucket through persisted credentials, prove idempotence, and confirm Template remains archived.
