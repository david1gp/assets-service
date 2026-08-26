# Organization admin project visibility

## Goal

Allow Contentoren organization owners and administrators to see and access every assets-service project in their organization without individual project grants, while preserving project-grant access for regular users; deploy and validate this in production.

## Decisions

- Trust only administrator/owner status established by Zitadel-authenticated data.
- Scope elevated access to the authenticated organization; never grant cross-organization visibility.
- Keep existing project roles and per-project grants unchanged for non-administrators.
- Resolve organization-wide project visibility from Zitadel during human authentication rather than interpreting project-role claims as administrator status.
- Use Zitadel's authenticated organization-membership API with an explicit narrow role boundary: `ORG_OWNER`, `ORG_OWNER_VIEWER`, `ORG_PROJECT_MANAGER`, and `ORG_PROJECT_MANAGER_VIEWER`. Retain normal role checks for non-administrators and service accounts.
- For human tokens without an organization claim, validate membership against the configured Contentoren organization and establish that organization only when the matching administrator membership is authoritative; never infer it from the login name or instance role.
- Use the smallest compatible source and production configuration changes.

## Approach

- Confirm how Zitadel represents organization owners/administrators and what the production identity/token exposes.
- Extend principal authorization and project listing to recognize organization-wide administrators.
- Cover elevated and regular-user behavior with focused tests.
- Deploy through the existing production setup and validate with the contentoren-master account and regression checks.

## Tasks

- [x] 1. Establish the verified Zitadel claim/API source for organization owner and administrator status and inspect current production/deployment wiring.
- [x] 2. Implement organization-admin project visibility and access with focused automated tests.
- [x] 3. Review and run the relevant local verification suite; ensure human organization administrators can authenticate without an organization claim or configured service-project grant.
- [x] 4. Deploy the verified build to production using the existing deployment directories.
- [ ] 5. Validate production project listing and authorization with an authenticated Contentoren owner session; Leo and the clarified contentoren-master account now have `ORG_OWNER`, but the stored contentoren-master password is invalid and no other owner credential/session is available. Service-account grant regression is verified.

## Paths

- `src/authentication/`
- `src/project/`
- `src/api/`
- `src/**/*.test.ts`
- `docs/20260823_organization_admin_project_visibility.md`
- `~/opensource/zitadel`
- `~/leo/contentoren-server`
- `~/leo/leo-server`
