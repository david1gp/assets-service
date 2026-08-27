# Bulk upload and safe local cleanup

## Goal

Add remote CLI commands that compare and upload project assets from `./images`, `./videos`, `./documents`, and `./fonts`, then optionally remove each local file only after the service proves that the same source revision is backed up, processed, published, and present in the current catalog.

## Decisions

- Add `assets diff [root]` and `assets upload-all [root]`; keep the existing single-file `assets upload` and server-side legacy `assets import` semantics unchanged.
- Default `root` to `.` and default source directories to `./images`, `./videos`, `./documents`, and `./fonts`. Allow one source directory per class to be changed or disabled in project configuration and overridden for one CLI invocation.
- Scan configured source directories recursively in deterministic lexical order. Resolve configured paths relative to the project root and reject overlapping class roots.
- Treat configured class roots as class markers, not logical folders. Strip the configured class root when deriving the upload path, preserve its project-relative path as `sourcePath`, and enforce the existing maximum of three logical folders.
- Do not follow symlinks or read special files. Validate every path, media type, duplicate target, normalized collision, and folder depth before making network mutations.
- Add `document` as a first-class asset class with one byte-preserving `default` output. Initially accept PDF, JSON, DOC/DOCX, XLS/XLSX/XLSM, PPT/PPTX, ODT/ODS/ODP, RTF, CSV, and plain text through explicit MIME/extension mappings. Documents use the same backup, immutable publication, catalog, and generated-list guarantees as other classes.
- `assets diff` is read-only. It reports `new`, `changed`, `matching`, `remote-only`, `unsupported`, and `conflict` entries, plus whether a matching local source is eligible for deletion.
- Compare normalized class, logical path, SHA-256, byte size, and media type. Never infer equality from basename or catalog output hashes.
- Add source-revision lineage to output versions and a server-side deletion-eligibility read endpoint. The endpoint must atomically prove that the current source revision has a matching verified backup, successful workflow, output versions from that revision, and entries in the current catalog.
- `assets upload-all` uploads only `new` and `changed` entries through the existing intent, signed PUT, completion, and workflow pipeline. Matching entries are skipped.
- `--delete` implies waiting. Reject `--delete --no-wait`. Delete newly uploaded or already matching local files only after the eligibility endpoint returns eligible for that exact source revision.
- Immediately before unlinking, re-read file identity and hash. Retain files that changed during the command. Delete files only, never directories.
- Continue through independent per-file upload or cleanup failures, return a nonzero exit when any entry fails, and emit deterministic per-file results in human and `--json` modes.
- Do not add bidirectional sync or remote deletion. `diff` plus `upload-all` covers verification and upload without allowing a local omission to delete a remote asset.

## Approach

- Extend the document domain from schemas and SQLite constraints through ingestion, passthrough processing, publication, catalogs, generated lists, and API contracts.
- Link each output version to its source revision, preserve nullable lineage only for migrated legacy rows, and use a focused API query to compute local-deletion eligibility.
- Add one shared project source configuration contract, then extract client-side tree scanning, local file fingerprinting, remote manifest loading, comparison, and cleanup guards into bounded CLI modules returning `Result` values.
- Build both commands on the same comparison model so dry-run, diff, upload selection, JSON output, and deletion decisions cannot diverge.
- Reuse existing API pagination, upload intent/PUT/completion, workflow waiting, authentication, and structured error envelopes.

## Tasks

- [x] 1. Extend core schemas and SQLite constraints for the `document` asset class, with explicit passthrough output definitions and document MIME/extension validation.
- [x] 2. Add byte-preserving document processing, workflow jobs, publication, and focused workflow tests.
- [x] 3. Add document catalog entries, generated `documentList`, legacy import parity, fixtures, and focused tests.
- [x] 4. Add source-revision lineage to output versions and implement a read-only API/client contract that returns deletion eligibility for an exact current source revision.
- [x] 5. Add shared project source configuration with the four default directories, per-class changed or disabled paths, CLI overrides, and overlap validation.
- [x] 6. Implement deterministic configured-root scanning, path mapping, preflight validation, file fingerprinting, remote manifest loading with history, and diff classification as reusable CLI modules.
- [x] 7. Add `assets diff [root]` with human and JSON output, mismatch exit behavior suitable for CI, and tests for pagination, conflicts, unsupported files, remote-only entries, and stable ordering.
- [x] 8. Add `assets upload-all [root]` with `--integration-note`, `--wait`/`--no-wait`, `--poll-interval`, `--dry-run`, and `--delete`; reuse single-upload transport and verify eligibility plus unchanged local identity before unlinking.
- [x] 9. Add mixed-result, interrupted-run, retry, changed-before-delete, workflow failure, ineligible revision, and deletion failure tests.
- [x] 10. Update CLI and operations documentation for configuration, diff, document passthrough, bulk upload, and safe cleanup.
- [x] 11. Run the complete test, typecheck, lint/check, and build suites.

## Paths

- `src/entrypoints/assets-cli.ts`
- `src/config/`
- `src/api-client/`
- `src/upload/`
- `src/asset/`
- `src/schemas/`
- `src/processing/`
- `src/workflow/`
- `src/output/`
- `src/catalog/`
- `src/infrastructure/db/schema/`
- `drizzle/`
- `test/assetsCli.test.ts`
- `test/assetsApiClient.test.ts`
- `test/uploadMediaTypeCheck.test.ts`
- `test/catalog.test.ts`
- `tests/integration/backendVerification.test.ts`
- `README.md`
- `docs/operations.md`
