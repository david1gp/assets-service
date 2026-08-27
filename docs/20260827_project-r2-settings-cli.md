# Project R2 settings CLI

## Goal

Allow administrators to read and update runtime project environment R2 bucket, optional prefix, and public base URL through the remote assets CLI.

## Decisions

- Reuse the authenticated project settings API and existing CLI configuration.
- Update one environment without discarding the project's other settings or environment.
- Support both `development` and `production`.
- Keep the existing project settings UI unchanged because it already supports these fields.
- Add `assets settings read [--project <id-or-name>] [--environment <development|production>] [--json]`.
- Add `assets settings update [--project <id-or-name>] --environment <development|production> [--r2-bucket <bucket>] [--r2-prefix <prefix>] [--public-base-url <url>] [--json]`.
- Require at least one changed field for updates; omitted fields remain unchanged and an explicitly empty prefix clears it.

## Approach

- Follow existing CLI command, option, output, authentication, and error conventions.
- Read the complete settings document before a targeted update, merge the selected environment binding, then write the complete document.
- Document commands and cover parsing, merge behavior, API errors, and help output.

## Tasks

- [x] 1. Inspect CLI conventions and define the exact read/update command interface.
- [x] 2. Implement project R2 settings CLI read and targeted update behavior with tests.
- [x] 3. Document usage and run full verification.

## Paths

- `src/entrypoints/assets-cli.ts`
- `src/api-client/assetsApiClientCreate.ts`
- `test/assetsCli.test.ts`
- `docs/`
