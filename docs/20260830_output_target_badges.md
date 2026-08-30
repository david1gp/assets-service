# Output target badges

## Goal

Display asset output targets as chips after the asset filename instead of presenting an output key as a folder-like path.

## Decisions

- Keep the asset filename first.
- Render every output target as a separate chip because an asset can have multiple targets.
- Derive chip labels from structured output properties such as dimensions and format, not by parsing the output key.
- Keep output-version history and generated object paths separate from target chips.
- Reuse generic components from `./ui` through `#ui/...`; do not modify `./ui`.

## Approach

- Locate the asset-name/path presentation that currently makes an output target look like a directory.
- Replace the folder-like presentation with compact target chips following the filename.
- Preserve existing navigation and output actions.
- Verify focused tests/type checks and the rendered UI in a browser.

## Tasks

- [x] 1. Implement output-target chips in the relevant asset UI and add or update focused tests.
- [x] 2. Verify the affected UI in a browser and fix only issues caused by this change.
- [x] 3. Run the commit workflow and push the changes.
- [ ] 4. Deploy the committed revision and verify deployment health.
