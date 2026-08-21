# CLI project resolution

## Goal

Let the assets CLI determine the target project from explicit configuration, `package.json`, or single-project access, with actionable errors; commit and release the change.

## Decisions

- Resolution order: `--project`, `ASSETS_PROJECT`, saved CLI configuration, `package.json.name`, sole accessible project, then fail.
- Match `package.json.name` exactly, including npm scopes.
- Resolve the relevant package from the command’s project root.
- When no project is accessible, direct users to verify API URL, token, and access.
- When identity is ambiguous, suggest `--project <name>` or `ASSETS_PROJECT` in the environment or a `.env` file only if `.env` loading is supported.
- Preserve existing saved CLI configuration compatibility if present.

## Approach

- Inspect current resolution, environment loading, tests, documentation, and release workflow.
- Implement the smallest compatible resolution change and error messages.
- Add focused tests and update consumer-facing CLI documentation.
- Verify, commit using repository conventions, then publish a release using the existing workflow.

## Tasks

- [x] 1. Inspect current project resolution, `.env` support, tests, package metadata, and release conventions.
- [x] 2. Implement project-name resolution and actionable errors with focused tests/docs.
- [x] 3. Run repository verification and review the final diff.
- [x] 4. Commit the intended changes.
- [ ] 5. Release and verify the published version/artifacts.

## Paths

- `docs/20260821_cli_project_resolution.md`
- `src/entrypoints/assets-cli.ts`
- `package.json`

## Current context

- Resolution is implemented for bulk commands using the positional root’s exact `package.json.name`, after explicit environment/saved configuration and before sole-project fallback.
- The CLI has no explicit dotenv parser; Bun runtime `.env` loading supports the current-working-directory guidance in the error.
- Releases use `bun run release`; the script versions, builds, commits, tags, pushes, and creates a GitHub release, but npm publication is not visible in the repository workflow.
- Error guidance distinguishes missing token/access from ambiguous project selection and accurately describes Bun’s current-working-directory `.env` behavior.
- Full repository checks pass with 311 tests.
