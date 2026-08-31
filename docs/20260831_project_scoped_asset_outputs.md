# Project-scoped asset outputs

## Goal

Allow different projects to publish the same relative asset output key, complete the Template 1920×1080 publication, and remove the accidental Template uploads from Abikur safely.

## Decisions

- Keep public catalog paths and object-key shapes unchanged.
- Scope output-version and blob uniqueness by project.
- Preserve retryable output allocations after publication failures.
- Use the existing resumable deletion workflow with the production backup-delete adapter.
- Serialize catalog publication and provide a supported rebuild from current outputs.
- Do not delete legacy Template assets that do not collide with the 26 regenerated previews.

## Approach

- Add and migrate project ownership for output versions and project-scoped uniqueness constraints.
- Scope object-key repository lookups by project.
- Deploy the service migration and worker wiring together after verification.
- Retry Template processing, regenerate its service catalogs, build, deploy, and browser-check images.
- Resume deletion of only the 26 audited accidental Abikur assets, regenerate catalogs, build, deploy, and browser-check images.
- Rebuild Abikur's empty production catalog from its 43 current outputs before deployment.

## Tasks

- [x] 1. Implement project-scoped output and blob ownership with migration and tests.
- [x] 2. Wire the production backup deletion adapter.
- [x] 3. Review and verify the complete service change.
- [x] 4. Deploy/migrate assets-service and verify API/worker health.
- [x] 5. Retry and publish the 26 Template outputs, regenerate lists, build, deploy, and browser-check.
- [x] 6. Resume deletion of the 26 accidental Abikur assets, regenerate lists, build, deploy, and browser-check.
- [x] 7. Fix concurrent catalog publication and add a supported current-output catalog rebuild.
