# Zitadel organization roles

## Goal

Authorize every verified member of the Zitadel `Contentoren` organization as an Assets Service admin, while members of `Contentoren-Customers` can receive contributor access limited to selected Assets Service projects.

## Decisions

- Keep two application roles: `admin` and `contributor`.
- Derive admin access from verified `Contentoren` organization membership, not individual Assets Service user grants.
- Derive contributor access from Zitadel grants for `Contentoren-Customers`; contributors are never organization admins.
- Enforce contributor scope through existing Assets Service project bindings and matching Zitadel project grants.
- Do not create, reconcile, or delete customer project grants from Assets Service deployment scripts; Zitadel project grants are managed independently.
- Accept human identities only from the configured Contentoren and Contentoren-Customers organizations; keep service identities restricted to Contentoren.
- Require a signed matching `resourceowner:id` claim for Contentoren admins; require successful exact-organization membership verification for customers and never infer customer access from an organization claim alone.
- Keep binding ownership with Contentoren and filter customer access/listing by exact granted Zitadel project IDs.
- Keep service-account/PAT authorization grant-based.
- Remove the temporary individual Tim uploader grant after organization-based access is live.
- Fail closed when organization membership or grant scope cannot be verified.

## Approach

- Separate verified organization membership from organization-administrator state in the authentication principal and callback.
- Map verified `Contentoren` membership to application admin access.
- Map valid `Contentoren-Customers` contributor grants to contributor access and retain project-binding checks for selected projects.
- Treat Zitadel project grants as the sole source of customer project scope; do not maintain a separate allowlist or reconcile project selection from this repository.
- Adjust Zitadel project settings only as required to permit Contentoren members without individual role assignments while retaining project checks and role assertions.
- Reconcile organization identity and role definitions in server provisioning without managing customer project grants, then deploy in an order that avoids accidental privilege expansion.

## Tasks

- [x] 1. Specify the existing token, membership, project-grant, and project-binding flow and identify exact code/config changes and rollout constraints.
- [x] 2. Implement principal and human-login authorization for Contentoren admins and Contentoren-Customers contributors.
- [x] 3. Add focused authentication and authorization tests for both organizations, project scoping, outsiders, and service credentials.
- [x] 4. Update Zitadel provisioning for the organization policy without managing customer project grants, remove the superseded allowlist/reconciler, and retain explicit post-rollout cleanup for the temporary individual Tim grant.
- [ ] 5. Deploy application changes, migrate Zitadel configuration safely, invalidate stale sessions, and verify both roles in production. Deployment, migration, and session invalidation are complete; human role verification awaits an independently managed customer project grant and authenticated checks.
