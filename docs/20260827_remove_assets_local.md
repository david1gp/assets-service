# Remove assets-local

## Goal

Remove the local-only CLI, its filesystem state at `<root>/.assets-service/state.json`, and supporting code so the published CLI operates only against the remote assets service.

## Decisions

- Keep the remote `assets` CLI and its local source-scanning helpers used by remote `diff` and bulk upload commands.
- Remove the complete `assets-local` entrypoint and local service/publisher implementation.
- Remove local-only static reference analysis.
- Remove `outputLocalObjectKeyCreate` from the public library because it only supports the retired local implementation.
- Update current documentation and historical design documents so they do not describe `assets-local` as supported.
- Do not remove unrelated development servers, shared processing code, storage adapters, or external-tool process execution.

## Approach

- Delete the local CLI implementation, local-only service modules, local-only analysis, and tests.
- Remove package scripts, binaries, build handling, exports, and documentation references.
- Build and run the remaining remote CLI test, typecheck, and repository checks.

## Tasks

- [x] 1. Remove local-only source modules and public exports.
- [x] 2. Remove `assets-local` package/build wiring and local CLI tests.
- [x] 3. Remove or revise documentation references to local CLI support and local state.
- [x] 4. Verify tests, typecheck, build, and repository checks; fix only removal-related failures.

## Paths

- `src/entrypoints/assets-local-cli.ts`
- `src/local/`
- `src/reference-analysis/staticReferenceCountsCreate.ts`
- `src/output/outputLocalObjectKeyCreate.ts`
- `src/library.ts`
- `package.json`
- `test/assetsLocalCli.test.ts`
- `README.md`
- `docs/operations.md`
- `docs/20260817_assets_microservice.md`
- `docs/20260818_bulk_upload.md`
- `docs/20260819_sidecar-alt-metadata.md`
