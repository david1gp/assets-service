# Assets Service Split Deployment

## Goal

Always build and deploy the production Web UI, split production deployment into independently runnable frontend and backend build/upload/deploy commands, make the aggregate deploy run both, deploy production, and verify the authenticated UI end to end.

## Decisions

- Production frontend builds are mandatory.
- Provide `frontend:{build,upload,deploy}` and `backend:{build,upload,deploy}` entry points.
- `frontend:deploy` and `backend:deploy` each run their matching build then upload flow.
- Package scripts are the canonical command interface; a repository adapter delegates production operations to the Contentoren deployment wrapper.
- Frontend upload publishes `dist/ui` into the API-served remote `dist/ui`; no separate static host or service is introduced.
- `deploy` builds both components, uploads backend then frontend, and performs shared migration/service/proxy activation once.
- Keep the existing source-sync/systemd production architecture and make the smallest compatible change.
- Do not change authentication or organization semantics in this deployment task.

## Approach

- Inspect the current local and Contentoren deployment scripts and choose command wiring consistent with existing project conventions.
- Refactor deployment operations so frontend artifacts and backend source/runtime concerns can be built and uploaded independently without stale artifact deletion.
- Add focused automated verification for command composition and frontend availability where practical.
- Run repository checks, deploy both components to production, then verify service health, login routing, static/deep-link UI behavior, and authenticated asset-management flows in a real browser.

## Tasks

- [completed] 1. Inspect deployment scripts, package commands, tests, and live service constraints; define exact command/file changes.
- [completed] 2. Implement split frontend/backend build, upload, and deploy commands with unconditional frontend builds and aggregate deployment.
- [completed] 3. Add or update focused tests and deployment documentation.
- [completed] 4. Run local static checks and deployment-focused verification.
- [completed] 5. Deploy frontend and backend to production using the aggregate command.
- [completed] 6. Verify production service status and Web UI end to end through the Zitadel login boundary; authenticated organization/project/asset behavior requires an authorized user session.

## Paths

- `package.json`
- `ops/`
- `dist/ui/`
- `/home/david/leo/contentoren-server/assets-service/`
- `/home/david/leo/contentoren-server/shared/routes.json`
