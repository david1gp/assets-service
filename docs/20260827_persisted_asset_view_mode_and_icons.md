# Persisted asset view mode and icons

## Goal

Persist the List/Structure selection in local storage instead of the URL `tab` parameter, and add MDI icons to every action button in the asset list and structure views.

## Decisions

- Keep `class`, `folder`, `search`, `cursor`, and dialog state in the URL; remove only view-mode URL synchronization.
- Default to `list` when no valid stored mode exists.
- Reuse the existing validated local-storage persistence and signal-object patterns.
- Keep the existing tab accessibility semantics and visible button labels.
- Add icons only where currently missing; retain existing icons.

## Approach

- Add a validated List/Structure preference persistence helper.
- Hydrate and persist the page view signal independently of search parameters.
- Remove `tab` handling from filter URL updates without disturbing other URL parameters.
- Add MDI icons to the two mode controls, preview toggle, and structure-dialog cancel action.
- Update focused tests for local-storage persistence, URL isolation, and icon coverage.

## Tasks

- [x] 1. Implement view-mode local-storage persistence and unit coverage.
- [x] 2. Move page view state off the URL and update state tests.
- [x] 3. Add missing MDI icons to relevant action and mode buttons.
- [x] 4. Verify focused tests, type checking, linting, and build.

## Paths

- `src/ui/pages/uiAssetViewPreferencePersistenceCreate.ts`
- `src/ui/pages/uiAssetListPageStateCreate.ts`
- `src/ui/pages/UiAssetListPage.tsx`
- `src/ui/structure/UiAssetStructureView.tsx`
- `test/uiBrowserState.test.ts`
- `test/uiStructure.test.ts`
