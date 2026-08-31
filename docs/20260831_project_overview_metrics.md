# Project overview metrics

## Goal

Replace the projects overview table with project cards that show useful asset totals, move project search controls outside the surrounding card, and show a grand total across the projects in the overview.

## Decisions

- Keep the existing authenticated project-list route, URL-backed search, cursor pagination, and Solid/Tailwind architecture.
- Treat `ui/` as read-only and reuse existing generic components through `#ui/...` imports.
- Add `assetCount` and `totalFileSize` to each project-list API item without changing the global project schema.
- Calculate project storage from each asset's current source revision byte size, excluding historical revisions and generated outputs.
- Aggregate metrics in grouped database work rather than issuing one query per project.
- Compute the displayed grand totals in the UI from the project items currently shown in the overview.
- Remove slug, default environment, and explicit settings entries from the overview; each project card remains the navigation entry to its assets.

## Approach

- Extend the project-list repository/API contract with per-project aggregate metrics and focused tests.
- Rework the projects overview into a responsive card grid with search controls in the page flow and concise count/size formatting.
- Verify contracts, repository behavior, UI structure, and the rendered overview at desktop and mobile widths where authentication permits.

## Tasks

- [x] 1. Add per-project asset count and current-source file-size aggregation to the project-list repository and API contract, with tests.
- [x] 2. Replace the projects table with responsive project cards, move search outside the card, and add UI-computed overview totals.
- [x] 3. Run focused and full verification, including browser checks of the authenticated overview when possible, and fix regressions.
