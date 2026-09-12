# User-owned assets projects

## Goal

Enable Fabian, David, and Leo to use the assets-service CLI with their own Zitadel identities to create projects and upload assets without Zitadel administrator access, then migrate each existing project containing images, video, or other assets one at a time while safely skipping projects already present.

## Decisions

- Work on `leo@leo-server` and preserve the existing assets-service and Zitadel setup.
- Give each named user only the permissions needed for user-owned project creation and asset upload.
- Reuse each user machine's configured Cloudflare credentials to create the required R2 storage and register it with assets-service without exposing credentials in source control or output.
- Discover source projects and existing assets-service projects before changing data.
- Process projects individually and use an idempotent existence check to skip prior uploads.
- Reuse installed project libraries and existing CLI/configuration rather than introducing parallel tooling.

## Approach

- Inspect the remote assets-service, CLI, Zitadel configuration, users, and candidate source directories.
- Current remote context: the CLI is installed at `/home/leo/.local/bin/assets`, the service checkout is `/home/leo/projects/assets-service`, and the configured endpoints are `assets-service.contentoren.de` and `auth.contentoren.de`.
- Implement and verify least-privilege user provisioning/authorization for Fabian, David, and Leo.
- Current authorization context: assets-service now accepts a backward-compatible exact PAT subject allowlist through `ZITADEL_PROJECT_PROVISIONER_SUBJECT_IDS`; uploads still require matching Zitadel project grants.
- Integrate idempotent per-project R2 provisioning and secure storage registration into the user CLI workflow.
- Current storage context: `assets projects create --create-buckets` idempotently provisions distinct final R2 buckets through Wrangler and stores their bindings, but per-bucket scoped credential registration is still required before uploads can succeed.
- Cloudflare's official R2 token behavior maps account-token `result.id` to the S3 access key, the lowercase SHA-256 hex digest of `result.value` to the S3 secret, and `result.id` to the revocation ID; the raw one-time value is never persisted or logged ([documentation](https://developers.cloudflare.com/r2/api/tokens/#get-s3-api-credentials-from-an-api-token)).
- Validate project creation and upload through the CLI while authenticated as a normal user.
- Current user context: active machine users `assets-fabian`, `assets-david`, and `assets-leo` have only `ORG_PROJECT_CREATOR`; each also has one dedicated Zitadel Assets project with exact `admin` and `contributor` grants, plus a protected CLI environment installed in the matching remote OS account.
- Inventory asset-bearing projects, reconcile them with existing service projects, and migrate each missing project sequentially.
- Report user provisioning and per-project outcomes.

## Tasks

- [x] 1. Inventory the remote deployment, authentication/authorization flow, users, candidate projects, and existing uploaded projects.
- [x] 2. Add the smallest required assets-service/Zitadel provisioning and authorization changes.
- [ ] 3. Add idempotent R2 bucket creation from each user's configured Cloudflare credentials and register project storage securely.
- [x] 4. Provision and verify Fabian, David, and Leo as enabled normal users with CLI access.
- [ ] 5. Verify a normal user can create an owned project, provision storage, and upload assets without administrator credentials.
- [ ] 6. Reconcile and migrate asset-bearing projects one by one, skipping those already present.
- [ ] 7. Run final verification and summarize provisioning and migration results.
