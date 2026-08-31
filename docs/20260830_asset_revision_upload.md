# Asset revision upload

## Goal

Allow an asset detail page to upload a replacement source file as a new revision, including file-picker and drag-and-drop interaction. Collapse Metadata JSON by default and make Edit outputs the prominent primary action.

## Decisions

- Associate replacement uploads explicitly with the current asset by adding an optional `assetId` to upload intents; do not depend on matching filename and folders.
- Preserve the asset identity and folder placement when ingesting an explicit replacement.
- Require the replacement file to resolve to the asset's existing class; reject incompatible replacements instead of creating another asset.
- Reuse the existing upload intent, direct PUT, checksum, completion, workflow, and validation helpers.
- Use native file drag/drop and existing `#ui` components; add no dependency and do not modify `./ui`.
- Present Metadata JSON through the generic `Details` disclosure without `open`, and use the filled primary button treatment for Edit outputs.

## Approach

- Extend the upload request/repository/ingestion path to carry and validate an optional target asset.
- Add replacement-upload state to the asset detail state using the current asset and existing upload client workflow, then refresh detail and activity data after acceptance.
- Add a visible upload area to the asset detail view supporting click selection and file drop, with selected-file, validation, progress, error, and submit/reset behavior.
- Adjust metadata disclosure and output action hierarchy in the existing detail page.
- Cover API association and rejection behavior, UI state, DOM interactions, and browser-visible behavior.

## Tasks

- [x] 1. Add explicit existing-asset association to upload intent and ingestion, including validation and API/repository tests.
- [x] 2. Add asset-detail replacement upload state and focused state tests.
- [x] 3. Implement the detail-page upload drop area, collapsed Metadata JSON, and primary Edit outputs action with DOM tests.
- [x] 4. Verify the complete detail-page flow in a browser and fix only defects in this feature.
