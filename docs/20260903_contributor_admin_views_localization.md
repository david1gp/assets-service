# Contributor and Admin Views with EN/DE Localization

## Goal

Provide organization-derived contributor and admin experiences on separate project paths, automatically open a contributor's sole project, simplify contributor asset management, and translate all application UI text between English and German with persisted browser-default language and existing light/dark theme support.

## Decisions

- Project view roots are `/projects/:projectId/contributor` and `/projects/:projectId/admin`.
- Contributor subpaths provide only `/upload` and `/assets`; the contributor root presents matching “Upload new” and “View/edit existing” cards.
- Admin subpaths retain Assets, Upload, Jobs, Backups, Catalog, Audit, and Settings. Audit and every other existing application label are localized.
- An authenticated Contentoren organization member has admin mode and may switch between admin and contributor paths. An authenticated Contentoren-Customers member has contributor mode and cannot enter or switch to admin paths.
- Organization mode is derived server-side from the exact configured organization IDs already used by authentication, exposed as typed session data, and never inferred from display text or client input.
- Navigation is selected by the active view path: admin paths show the complete admin navigation; contributor paths show only Upload new and View/edit existing. Language, theme, account, project, and sign-out controls remain available in both views.
- A contributor with exactly one accessible project is redirected from the project list directly to that project's contributor root. Contributors with zero or multiple projects keep the project-selection view. Admin project selection remains unchanged.
- Contributor assets reuse existing asset APIs/state but use a dedicated simplified presentation that omits technical identifiers and operational details while preserving the user-facing fields and actions needed to view/edit assets.
- Contributor upload reuses the existing upload flow and upload area rather than duplicating transfer logic.
- Application localization uses `ttc(englishText, germanText)`, which reads the global `languageSignal` reactively. No external i18n dependency is added.
- Supported languages are `en` and `de`. A valid local-storage preference wins; otherwise initial language follows the browser (`de*` selects German, all others English). Changes persist asynchronously in local storage.
- All user-facing application copy, including visible labels, empty/loading/error states, dialogs, toasts, accessibility text, progress text, and validation messages, is converted to explicit English/German `ttc` calls. The read-only `ui/` library is not modified.
- New code follows one-export-per-file, subject-first naming, validated persisted values, and view-only TSX state factories.

## Approach

- Extend authenticated session contracts with a server-derived view mode, then centralize client access checks and route destinations around that trusted value.
- Add validated global language state, browser initialization, deferred persistence, `ttc`, and a shared language toggle before converting feature copy.
- Introduce mode-specific route trees and redirects while sharing existing page state and API clients where behavior is common.
- Build contributor-specific shell navigation, landing cards, upload composition, and a reduced asset list/detail presentation; keep admin pages behaviorally unchanged under the admin route tree.
- Translate shared shell/auth/query copy first, then each feature area in bounded increments with focused tests.
- Verify unit/integration behavior, static/type/style checks, production build, and both roles in a real browser across EN/DE and light/dark themes.

## Tasks

- [ ] 1. Add a typed server-derived `admin`/`contributor` mode to authenticated session data using configured Contentoren and Contentoren-Customers organization IDs; update schemas, API client contracts, and authentication/session tests.
- [ ] 2. Add `languageSignal`, validated browser/local-storage initialization, deferred persistence, and the reactive `ttc(englishText, germanText)` helper with focused tests.
- [ ] 3. Add the EN/DE language toggle to the shared shell beside the existing theme control and localize shared shell, authentication, query, navigation, and account controls.
- [ ] 4. Add admin and contributor project route trees, known-route recognition, mode guards, safe legacy-route redirects, and an admin-only view switch; test direct URL access, switching, and contributor denial of admin paths.
- [ ] 5. Make contributor project selection redirect directly to the contributor root only when the complete accessible result contains exactly one project; preserve zero/multiple-project and all admin selection behavior.
- [ ] 6. Implement the contributor project landing page and two-item navigation for Upload new and View/edit existing, reusing the existing upload workflow under contributor paths.
- [ ] 7. Implement simplified contributor asset list/detail views that omit technical IDs and operational/admin details while retaining previews and the supported view/edit actions; keep admin asset pages complete.
- [ ] 8. Localize project selection/settings and asset list/structure UI, including state-generated validation, status, toast, dialog, empty-state, and accessibility text; update focused tests.
- [ ] 9. Localize upload, replacement upload, asset detail, output, deletion, jobs, backups, catalog, and audit UI and state-generated copy; update focused tests.
- [ ] 10. Run full typecheck, tests, formatting/lint checks, and production build, then browser-verify admin and contributor routing, sole-project redirect, both navigation sets, contributor simplification, EN/DE persistence, and light/dark presentation.
