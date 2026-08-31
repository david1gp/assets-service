# Audit action filter

## Goal

Make the audit page show every audit action type by default and let users filter by remembered action names with `CheckMultiple`, including a virtual `all` option.

## Decisions

- Define one shared catalog for the production audit actions: `asset.created`, `asset.deletion_requested`, and `asset.deleted`.
- Render `all` plus the catalog through `CheckMultiple`; `all` is UI-only and is never sent to the API.
- Default to `all`, represented by no `action` URL/API filter.
- Selecting individual actions supports OR filtering; selecting `all` clears individual filtering.
- Encode selected action filters in one comma-separated `action` query parameter to stay compatible with the existing scalar query plumbing.
- Preserve exact matching for each selected action and keep pagination/cache keys filter-aware.

## Approach

- Add a shared typed audit-action catalog and use it at production emission sites and in the audit UI.
- Adapt the audit page state to translate between the virtual `all` selection, selected action arrays, URL state, and API queries.
- Extend audit query validation and persistence filtering to accept comma-separated selected actions and match any selected action.
- Replace the free-text action input with `CheckMultiple` and retain the existing apply/clear interaction.

## Tasks

- [x] 1. Add the shared production audit-action catalog and update emitters to use it.
- [x] 2. Add multi-action query parsing and OR filtering through the API/repository, with tests.
- [x] 3. Update audit page state and UI to use `CheckMultiple` with virtual `all`, with tests where practical.
- [x] 4. Run full verification and browser-check the audit filtering flow.
- [x] 5. Use the commits skill to create and push appropriate commits, then deploy with the canonical production command.
