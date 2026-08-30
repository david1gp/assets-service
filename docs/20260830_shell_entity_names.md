# Shell entity names

## Goal

Show human-readable project and signed-in user names in the authenticated project shell, with their raw IDs retained below in subtle gray text, then publish the verified change to production.

## Decisions

- Resolve the project name through the existing project-read API in shell state so all project routes benefit.
- Derive the user display name only from claims in the already-verified OIDC ID token; do not trust unverified input or add a userinfo request.
- Keep the principal display name optional for existing sessions and service accounts, falling back to the subject ID.
- Keep route content and navigation usable while project metadata loads or fails.
- Do not modify the read-only `./ui` library.

## Approach

- Extend the authenticated principal with an optional display name and persist it during human login.
- Add a non-blocking project query to shell state.
- Render names as primary shell labels and IDs as muted secondary labels in desktop and mobile contexts.
- Add focused authentication/session and shell-state or rendering coverage, then run repository checks.
- Use the repository's commits skill to commit and push the verified phase, then run the documented production deployment.

## Tasks

- [x] 1. Add verified OIDC display-name extraction to the authenticated principal/session flow with focused tests.
- [x] 2. Load project metadata in shell state and render project/user names with muted IDs, including non-blocking fallbacks and focused tests.
- [x] 3. Run focused and full verification, including a browser check of the authenticated UI where access permits.
- [x] 4. Commit and push the completed phase using the commits skill, deploy it, and verify production health.
