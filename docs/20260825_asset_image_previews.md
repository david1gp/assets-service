# Asset image previews

## Goal

Add a show/hide image previews toggle to `/assets` for both List and Structure views, using an optimized image output when available.

## Decisions

- Keep the existing List/Structure selection URL-backed through the `tab` query parameter.
- Persist the preview preference in browser local storage.
- Default previews to hidden to preserve current behavior and avoid unnecessary image requests.
- Reuse generic components from `./ui`; do not modify the library copy.

## Approach

- Add a local-storage-backed preview preference to the asset list page state.
- Add an accessible preview toggle beside the List/Structure controls.
- Select the smallest suitable optimized image output, falling back to the original image when needed.
- Render lazy-loaded thumbnails in both List and Structure views only when enabled.
- Add focused state/rendering coverage and run relevant checks.

## Tasks

- [x] 1. Add the persisted preview preference and optimized preview-source selection with focused tests.
- [x] 2. Add the preview toggle and List-view thumbnails.
- [x] 3. Add Structure-view thumbnails.
- [x] 4. Review the integrated change and run code checks.
- [x] 5. Ensure previews render for representative assets, then verify `/assets` interaction and persistence in a browser.

## Paths

- `src/ui/pages/UiAssetListPage.tsx`
- `src/ui/pages/uiAssetListPageStateCreate.ts`
- `src/ui/structure/UiAssetStructureView.tsx`
- `src/ui/structure/UiStructureAssetChip.tsx`
- `src/ui/storage/`
- `test/`
