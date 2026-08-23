# Assets structure view

## Goal

Add a Structure view under `/assets` where logical folders can be created and assets can be moved with drag and drop without changing canonical asset paths, generated client values, processing outputs, or S3/R2 objects. Show first-level folders as sections, second-level folders as cards, and third-level folders as outlined areas inside cards. Increase the List view page size to 100.

## Decisions

- Name the tab/view `Structure`.
- Keep existing asset folder fields as canonical path metadata.
- Store Structure folders and asset membership separately from canonical paths.
- Backfill the logical hierarchy and memberships once from existing canonical folders.
- A Structure move updates membership only and never invokes canonical asset movement or processing.
- Use `@formkit/drag-and-drop` with an accessible non-drag move control.
- Reuse generic components from `./ui` without modifying that directory.
- Keep List as the default and persist the selected List/Structure view in the URL.
- Show unassigned assets in their own drop area and allow moving back to unassigned.
- Allow assets directly in any folder level; show empty drop targets explicitly.

## Approach

- Add logical folder and membership persistence with a one-time migration/backfill.
- Add project-scoped folder creation, structure reads, and asset membership mutation APIs.
- Add List and Structure tabs to `/assets`, folder creation controls, the three-level presentation, DnD, and accessible move controls.
- Preserve canonical folder/catalog/storage behavior and verify it with regression tests.

## Tasks

- [x] 1. Add logical folder and membership schemas, repository operations, migration, and canonical-folder backfill.
- [x] 2. Add API schemas, client methods, and project-scoped structure/folder/membership routes.
- [x] 3. Add the Structure tab/view, folder creation, three-level layout, DnD, and accessible move controls.
- [x] 4. Change the List view request limit to 100.
- [x] 5. Add regression tests and run formatting, typechecks, tests, builds, and browser validation.
- [x] 6. Review, create conventional commits with the commits skill, push, and deploy.

## Paths

- `drizzle/`
- `src/infrastructure/db/schema/`
- `src/asset/`
- `src/api-client/`
- `src/api/`
- `src/ui/pages/`
- `src/ui/common/`
- `src/ui/folder/`
- `test/`
- `package.json`
- `bun.lock`
