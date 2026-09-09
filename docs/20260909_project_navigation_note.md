# Goal
- Improve project navigation and allow users to edit asset usage notes in either view.

# Decisions
- Navbar view toggle uses icons with Mitwirkendenansicht / Adminansicht titles.
- Contributor project link opens the existing two-card landing page.
- Breadcrumb shows project / List, Upload, or asset name for the current page.
- Hinweis zur Verwendung is editable regardless of asset processing state in both views; retain project authorization.
- Reuse existing libraries and read-only generic components in ui/.

# Approach
- Add a project-authorized usage-note update API and client contract.
- Update shell navigation independently, then connect usage-note editors to the API.
- Run focused checks and browser verification.

# Tasks
- [x] 1. Add usage-note mutation API/client and tests. Client exposes project-scoped integration-note PATCH with an integrationNote string.
- [x] 2. Update navbar toggle, project link, and breadcrumbs.
- [x] 3. Add usage-note editors in both asset detail views.
- [x] 4. Verify integrated changes in checks and browser.
