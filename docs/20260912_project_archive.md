# Project archive and unarchive

## Goal

Add project-level archive and unarchive library APIs and CLI commands. Archiving must preserve the database metadata and verified Google Drive originals needed for recovery while removing the project's R2 objects and dedicated bucket. Unarchiving must recreate the bucket, restore originals from Google Drive, and regenerate all optimized assets. The web project list must hide archived projects by default and offer an owner/admin-only, off-by-default **Show archived** toggle that is never exposed in contributor view.

## Decisions

- Archive state belongs to the project and is retained with all asset, source revision, output definition, and verified backup receipt metadata; “remove all data” means all project object data in R2, not the recovery metadata in SQLite or Google Drive.
- Archive/unarchive are explicit, idempotent project workflows exposed through the public library, authenticated API, and CLI.
- Bucket deletion is allowed only when the bucket is proven dedicated to the archived project. Shared-bucket bindings fail safely rather than deleting another project's data.
- Archive becomes visible only after R2 cleanup and bucket deletion succeed. Unarchive becomes visible only after bucket provisioning, source restoration, optimized output regeneration, and verification succeed.
- Existing R2, rclone, processing, workflow, authorization, Solid UI, and Wrangler abstractions are extended and reused; no new external dependency is introduced.
- Archived projects are excluded server-side by default. Only owner/admin requests may opt in to listing them; contributor requests and contributor routes never expose them.
- Production verification targets the Template project and leaves it archived after verifying the deployed behavior.

## Approach

- Add persisted archive lifecycle state and safe list/authorization semantics, with a migration and typed contracts.
- Add reusable R2 bucket deletion/provisioning and Google Drive restore primitives with injectable fakes.
- Implement resumable archive/unarchive orchestration and expose narrow library/API operations.
- Add matching CLI commands and an owner/admin project-list toggle.
- Verify focused unit/integration coverage, full repository checks, browser behavior, commit/push, deploy, and production archive of Template.

## Tasks

- [x] 1. Add the project archive lifecycle schema/migration, repository operations, default archived filtering, admin opt-in listing, and contributor-safe authorization behavior with focused tests.
- [x] 2. Add safe, reusable storage primitives for Drive download/verification, paginated R2 project cleanup, dedicated-bucket validation, and Wrangler bucket create/delete with focused tests.
- [x] 3. Implement the idempotent archive workflow and public library export, preserving recovery metadata/Drive data while deleting project R2 data and its dedicated bucket; add focused tests.
- [x] 4. Implement the idempotent unarchive workflow and public library export to provision the bucket, restore verified originals from Drive, regenerate/verify optimized outputs, and complete the lifecycle; add focused tests.
- [x] 5. Add authenticated archive/unarchive API operations and matching CLI commands/help, with authorization and command tests.
- [x] 6. Add the off-by-default **Show archived** owner/admin project-list toggle, keep it absent from contributor view, and cover state/rendering behavior.
- [x] 7. Run focused and full checks, fix only feature-related failures, and verify owner/contributor UI behavior in a browser.
- [x] 8. Use the commits skill to split, commit, and push the completed changes.
- [ ] 9. Deploy production and verify service health.
- [ ] 10. In production, identify Template exactly, archive it through the new CLI, and verify it is hidden by default, visible with **Show archived**, absent to contributors, removed from R2 including its dedicated bucket, and retained in Google Drive.
