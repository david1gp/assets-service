# R2 bucket and domain migration CLI

## Goal

Add a safe `assets settings migrate` command that can move one project environment to another R2 bucket and/or prefix, provision a custom asset domain through an installed Wrangler CLI, verify the destination, and cut over project settings without deleting the source objects.

## Decisions

- Keep project/environment settings authoritative and require project-admin authorization.
- Use Wrangler only for Cloudflare control-plane operations: checking/creating the destination bucket and attaching/verifying a custom domain. Wrangler has no recursive R2 list or copy command.
- Run object discovery, same-account server-side copy, and verification in assets-service through the existing R2 adapter and durable workflow infrastructure.
- Support only buckets accessible with the service's configured R2 account and credentials. Cross-account transfer is out of scope.
- Treat domain-only migration as a no-copy operation. For bucket/prefix changes, copy and verify before changing settings.
- Plan by default; require `--apply` to provision resources and start migration. Never delete source objects.
- Make reruns idempotent, reject concurrent storage-setting changes, and retain enough durable state to resume or report a partial migration.
- Run the production migrations from `leo@leo-server` in `~/projects/abikur` and `~/projects/template`, using Leo's Cloudflare account.
- Bind `assets.abikur.de` for Abikur and `assets.template.leonardomora.de` for Template; create each destination bucket only when absent.

## Approach

- Add migration schemas and persistence for source/target binding snapshots, status, progress, idempotency, and an environment-level mutation lock.
- Add replay-safe storage migration services that enumerate all source namespaces, copy without overwrite, verify checksums/metadata/inventory, and conditionally update settings last.
- Expose authenticated plan/start/status endpoints and API-client methods; execute copy work through the worker.
- Extend the CLI with target bucket/prefix/base URL, Wrangler domain/zone/profile options, plan/apply behavior, and optional status waiting.
- Document command usage, same-account limits, rollback behavior, and the fact that old objects remain untouched.

## Tasks

- [x] 1. Add migration contracts, database schema, and a repository with idempotent creation, progress/status updates, and one active migration per environment.
- [x] 2. Add storage copy and verification primitives required for safe prefix-to-prefix migration, including paginated inventory comparison and destination collision checks.
- [x] 3. Add environment mutation locking and guard storage writes while a migration is active.
- [x] 4. Add the durable migration workflow: destination probe, copy, verification, conditional settings cutover, progress, retries, cancellation cleanup, and no source deletion.
- [x] 5. Add admin-authorized plan/start/status API routes and matching API-client methods.
- [x] 6. Add `assets settings migrate`, an injectable Wrangler runner for bucket/domain provisioning, plan/apply output, and wait polling.
- [x] 7. Add focused repository, storage, workflow, API, CLI, and failure-path tests.
- [x] 8. Update CLI and operations documentation and run the repository verification suite and production build.
- [ ] 9. Inspect and ready both remote projects and the assets-service deployment for the migration CLI; both buckets/domains and admin configurations are verified, and the schema snapshot is complete. Committing/releasing/deploying the backend and making the matching CLI available remain.
- [ ] 10. Plan, apply, and verify the Abikur and Template R2 bucket/domain migrations in Leo's Cloudflare account.
