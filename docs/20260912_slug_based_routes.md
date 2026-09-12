# Slug-based organization and project routes

## Goal

Use globally unique organization slugs and organization-scoped project slugs in all public Assets Service URLs while retaining immutable IDs for authorization, Zitadel integration, and persistence, including live/production references in `~/adaptive/project-registry`.

## Decisions

- Canonical project URLs use `/orgs/:orgSlug/projects/:projectSlug/...`.
- Organization slugs are globally unique; project slugs are unique within an organization.
- Resolve slugs to IDs at request boundaries and keep all internal authorization and relations ID-based.
- Slugs are immutable external identifiers.
- Existing ID-based project URLs remain compatible through redirects where practical.
- Assets Service URLs maintained by `~/adaptive/project-registry` are migrated to canonical slug routes and deployed to live/production after the service is ready.

## Approach

- Add repository/API lookups that resolve an organization by slug and a project by organization ID plus project slug.
- Include slugs in session and project response data needed by clients.
- Update UI route matching, route builders, navigation, and organization switching to generate canonical slug URLs.
- Preserve authorization behavior after resolving the route context.
- Add focused backend, routing, and browser coverage.
- Update project-registry configuration/content that points to Assets Service, verify generated URLs, and deploy both repositories in dependency order.

## Tasks

- [x] 1. Implement and test organization/project slug resolution at repository and API boundaries.
- [x] 2. Implement canonical slug-based UI routes, route builders, navigation, and legacy redirects.
- [x] 3. Update affected API client/session/UI models and add regression tests for scoped uniqueness and authorization.
- [x] 4. Run automated tests and browser verification of canonical navigation and direct-link behavior.
- [x] 5. Update every Assets Service URL in `~/adaptive/project-registry` to canonical organization/project slug routes and verify its tests/build.
- [x] 6. Use the commits skill to create and push conventional commits in each changed repository, then deploy to live/production in dependency order and verify both deployments.
