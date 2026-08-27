# Runtime R2 bucket bindings

## Goal

Allow project environments to select R2 buckets at runtime without startup allowlisting, and allow dedicated buckets to use no project prefix.

## Decisions

- Project environment bindings are the source of truth for runtime bucket names.
- R2 endpoint and credentials remain process-level secrets.
- `r2Prefix` remains compatible with existing data but may be empty for bucket-root storage.
- Storage namespaces (`public`, `private/source`, `private/staging`) remain mandatory.
- Existing non-empty prefixes and object locations are not migrated.
- Environment-specific R2 bucket and public-domain fallback variables are removed; project environment settings are authoritative.

## Approach

- Remove static bucket allowlisting from runtime and operational adapter composition.
- Normalize an empty prefix to the bucket root and conditionally build object keys.
- Update settings validation, persistence, deletion logic, UI guidance, documentation, and tests.

## Tasks

- [x] 1. Remove startup bucket allowlisting consistently from R2 adapter composition.
- [x] 2. Make `r2Prefix` optional at API, domain, and persistence boundaries.
- [x] 3. Support prefix-free object key construction and deletion/reconciliation behavior.
- [x] 4. Update project settings UI and operational documentation.
- [x] 5. Run focused and full verification, fixing only regressions caused by these changes.
- [x] 6. Remove development/production R2 bucket and public-domain environment fallbacks and verify the cleanup.

## Paths

- `src/entrypoints/`
- `src/doctor/`
- `src/infrastructure/storage/`
- `src/project/`
- `src/storage/`
- `src/deletion/`
- `src/ui/pages/`
- `drizzle/`
- `docs/`
