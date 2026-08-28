# Web UI redesign

## Goal

Improve the core assets-service web UI with a cohesive, responsive visual system and clearer navigation, hierarchy, controls, and feedback.

## Decisions

- Keep the existing Solid/Tailwind architecture and page-state separation.
- Treat `ui/` as read-only and reuse its generic components through `#ui/...` imports.
- Focus on the shell and primary asset workflows rather than redesigning every route.
- Preserve existing behavior and APIs; this is a UI/UX redesign.

## Approach

- Establish the visual direction in the application shell first.
- Apply that direction to the asset inventory, structure board, and asset detail page.
- Make responsive and accessibility behavior part of each increment.
- Verify the completed flow in a real browser at desktop and mobile widths.

## Tasks

- [x] 1. Redesign the application shell, navigation, project context, and header actions.
- [x] 2. Redesign the asset inventory toolbar, view controls, filters, and results hierarchy.
- [x] 3. Improve the structure board layout, asset chips, and drag-and-drop states.
- [x] 4. Redesign the asset detail page into a responsive, scan-friendly layout.
- [x] 5. Run browser verification and fix redesign regressions.
- [x] 6. Remove temporary verification artifacts and run final repository checks.

## Paths

- `src/ui/shell/`
- `src/ui/pages/UiAssetListPage.tsx`
- `src/ui/pages/UiAssetDetailPage.tsx`
- `src/ui/structure/`
- `src/ui/common/`
- `src/ui/styles.css`
- `ui/` (read-only reference)
