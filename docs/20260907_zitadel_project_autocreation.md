# Goal
Create a Zitadel project automatically when `assets projects create` omits its Zitadel project ID, then deploy and verify Contentoren setup and asset uploads on Leo.

## Decisions
- Reuse `@adaptive-ds/zitadel-cli` in the Assets CLI, with existing libraries first.
- Preserve supplied-ID registration and the existing API contract.
- Use the resolved organization ID and Assets project name for creation.
- Load `ZITADEL_BASE_URL` and `ZITADEL_TOKEN` through the existing protected project-create environment file; never commit credentials.

## Approach
Validate local project inputs before provisioning, create only when the ID is omitted, then submit the returned ID through existing registration. Document credential setup and test both paths and failures.

## Tasks
1. Complete: implement library integration, CLI behavior, documentation, and focused tests.
2. Complete: independently verify changes and run relevant checks.
3. In progress: Luna agent uses commits skill to commit/push intended changes, then deploy.
4. Pending: SSH as `leo` to `leo-server`, inspect `~/projects/contentoren`, and test setup, creation, and upload of all project assets using the assets skill.
