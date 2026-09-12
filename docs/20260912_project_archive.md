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
- [ ] 11. Archive production Template through the deployed CLI and verify it remains archived, is hidden by default, is visible with **Show archived**, is absent to contributors, has no current or historical R2 data or deleted-bucket domain bindings, retains SQLite metadata, and retains Google Drive backups.

## Current context

- Tasks 1–10 complete. The implementation is verified and pushed to `origin/main` in four conventional commits. Production deployment and verification passed after provisioning the protected `R2_CREDENTIAL_ENCRYPTION_KEY`; unrelated pre-existing worktree changes remain excluded. Template remains pending for task 11.
- Production CLI/storage/database preflight on 2026-09-12 found exactly one `Template` project (`db25c615-339e-4c14-9888-594fa28c377b`, Contentoren), currently `active`. It has 122 source revisions and 122 verified receipts, but 0 receipts use the required canonical project-ID Drive path; all 122 use the historical `contentoren/template` path, so mutation was not attempted. The unique R2 prefixes were `template/` (bucket already absent, 0 objects) and the retained shared `contentoren-assets-service-public/template/` (569 objects). SQLite metadata remains present: project 1, assets 71, revisions 122, output definitions 71, output versions 72, audit events 27, and backup receipts 122. Matching Drive backups remain: 122 receipts and 122 remote objects with 0 missing, extra, or size-mismatched objects. No dedicated bucket was deleted; its domain and credential-record counts are both 0. A protected Template-admin CLI credential/session was unavailable (production Cloudflare control-plane credentials were available), and task 11 remains unchecked pending receipt migration/authorized credentials and browser verification.
- Diagnosis: archive preflight incorrectly required each verified receipt path to start with the canonical project-ID prefix, even though receipt paths are opaque and verified historical paths remain valid. The existing backup path migration/backfill is not required to archive Template and was not run; no production project data, receipt metadata, or Drive objects were mutated. Archive matching now accepts validated historical and canonical `gdrive_beta` paths while still requiring project/source identity, verified status, byte size, and SHA-256 matches, without downloading or checksumming Drive bytes. Focused regression coverage passes; task 11 remains unchecked pending authorized credentials and browser verification.
