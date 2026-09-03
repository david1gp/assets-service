# Assets Automation Provisioner

## Goal

Enable `leo@leo-server` to register Assets Service projects noninteractively and then manage assets from `~/projects/allgroups-chat` and other project checkouts without requiring a human browser session.

## Decisions

- Keep human organization-admin project creation unchanged.
- Add one explicitly configured Contentoren Zitadel machine identity as an organization-scoped Assets Service project provisioner; do not grant project creation to ordinary service credentials.
- Authenticate the provisioner with a protected Zitadel PAT and authorize it by exact Zitadel subject ID plus organization ID.
- Keep runtime asset access project-scoped. Provision each target Zitadel project with canonical `admin` and `contributor` roles and an explicit grant; do not turn every project credential into a provisioner.
- Allow `assets projects create` to use the configured provisioner bearer credential as well as the existing human session cookie.
- Store all credentials outside git in mode-`0600` files and preserve the existing Leo project-wrapper convention.

## Approach

- Extend Assets Service authentication/configuration with a narrow project-provisioner capability derived only from the configured machine subject.
- Update project registration authorization and CLI credential handling while retaining organization equality and all existing project-bound authorization checks.
- Add idempotent Zitadel provisioning for the global provisioner and target-project access, including read-only checks and protected credential delivery to Leo.
- Deploy the server configuration, provision AllGroups Chat, and verify registration plus project-scoped asset operations from Leo.

## Tasks

- [x] 1. Implement and test exact-subject machine authorization for Assets Service project registration.
- [x] 2. Implement and test CLI bearer authentication for `assets projects create` and document the automation workflow.
- [x] 3. Add and verify idempotent Zitadel automation for the provisioner identity and per-project access.
- [ ] 4. Configure and deploy the Assets Service provisioner identity.
- [ ] 5. Install protected credentials on Leo and verify AllGroups Chat registration and asset access.
