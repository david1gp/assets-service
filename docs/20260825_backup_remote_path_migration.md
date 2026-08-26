# Backup remote path migration

## Goal

Adopt `backups/{organization}/{project}/assets/{logical-folders}/{source-revision-id}_{original-filename}` for new asset backups and safely migrate existing verified backup objects and receipt paths in production.

## Decisions

- Keep `gdrive_beta` and `backups` configuration and remove the per-backup timestamp directory.
- Preserve optional logical folders; when absent, place the revision-prefixed filename directly under `assets`.
- Treat receipt `remotePath` values as opaque so old and new layouts remain usable during migration.
- Migrate production data with an explicit, resumable operational command, not an automatic schema/deploy migration.
- Migration is dry-run by default, copies with immutable semantics, verifies byte size and SHA-256, then compare-and-swaps the receipt path.
- Keep old remote objects during a validation window; deletion is a separate explicit operation.
- Keep all temporary migration implementation under `src/migration/` so it can be removed after production migration and validation.

## Approach

- Change the canonical path builder and update focused tests and representative fixtures.
- Add a migration service and CLI that inventory verified receipts, derive canonical destinations from source metadata, detect collisions, copy and verify objects, update receipts idempotently, and persist a restartable journal.
- Add package/operations commands and a production runbook covering snapshot, worker pause, dry run, execution, verification, rollback, resume, and delayed cleanup.
- Verify focused backup/migration behavior, the complete test suite, and type checking.

## Tasks

- [x] 1. Change canonical remote path generation and update path/backup tests.
- [x] 2. Implement the resumable existing-object and receipt migration with tests.
- [x] 3. Add operational commands and production migration documentation.
- [x] 4. Update remaining fixtures/docs and run full verification.
- [x] 5. Move temporary code under `src/migration/` and resolve production-safety audit findings.
- [x] 6. Verify the finalized implementation and migration procedure.
- [ ] 7. Deploy the compatible application release to production.
- [ ] 8. Snapshot production, pause backup writes, dry-run and execute the migration.
- [ ] 9. Verify production data and service health, then resume normal operation.

## Paths

- `src/backup/rcloneRemotePathCreate.ts`
- `src/backup/rcloneRemotePathCreate.ts`
- `src/migration/`
- `src/infrastructure/db/`
- `test/`
- `ops/`
- `package.json`
- `docs/operations.md`
- `docs/production-configuration.md`
