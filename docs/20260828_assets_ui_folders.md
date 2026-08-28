# Assets UI folders

## Goal

Use the synced solid-ui library consistently and improve `/assets` folder filtering, visibility, assignment, and structure pagination.

## Decisions

- Sync `/home/david/adaptive/solid-ui/ui/` into `./ui/` as a read-only library copy.
- Resolve `#ui` through `package.json#imports`; remove duplicate Vite, Rsbuild, and TypeScript aliases.
- Keep the existing AGENTS.md instruction to inspect and reuse `./ui` before implementing UI; do not duplicate it.
- Render all nested folders as one flat, path-labelled select list.
- Folder visibility controls both folder filtering and folder presentation; folder-assignment visibility independently controls per-asset assignment selects when folders are shown.
- Use app-owned components under `src/ui` for folder behavior and pagination, composed from generic `#ui` components.

## Approach

- First synchronize/configure the shared library boundary and migrate remaining basic controls to suitable `#ui` primitives.
- Add shared URL/persisted display state and one reusable flat folder option source.
- Reuse the structure membership mutation behavior for list-row assignment.
- Make structure loading cursor-aware and expose the same first/next controls as list mode.
- Verify types, focused tests, builds, and browser behavior.

## Tasks

- [x] 1. Sync `ui`, remove duplicate resolver aliases, confirm AGENTS.md guidance, and migrate remaining basic controls to library components.
- [x] 2. Add flat nested-folder select filtering and shared show/hide folders plus assignment-select display options.
- [ ] 3. Add per-entry folder assignment controls to list mode using existing membership semantics.
- [ ] 4. Add first/next cursor pagination to structure mode.
- [ ] 5. Run focused/full verification and browser-check `/assets` interactions.

## Paths

- `AGENTS.md`
- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `rsbuild.config.ts`
- `ui/`
- `src/ui/pages/UiAssetListPage.tsx`
- `src/ui/pages/uiAssetListPageStateCreate.ts`
- `src/ui/structure/`
- `src/ui/common/UiPager.tsx`
- `test/`
