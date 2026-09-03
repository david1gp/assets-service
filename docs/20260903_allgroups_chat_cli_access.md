# AllGroups Chat Assets CLI Access

## Goal

Enable `leo@leo-server` to run the Assets Service CLI from `~/projects/allgroups-chat` using a dedicated, least-privilege Zitadel machine identity bound only to the AllGroups Chat Assets Service project.

## Decisions

- Keep the existing `AllGroups Chat Web` OIDC client for browser login only.
- Provision a separate Contentoren machine user and PAT for noninteractive CLI access.
- Grant that machine user on the Zitadel project bound to Assets Service project `allgroups-chat`, not on the Assets Service application's own Zitadel project.
- Use canonical Zitadel project roles `admin` and `contributor`; legacy `assets.admin` and `assets.uploader` remain compatibility aliases only and must not be provisioned for new projects.
- Keep the PAT outside git in a mode-`0600` environment or CLI session file on `leo-server`.
- Preserve the sibling checkout convention: `~/projects/allgroups-chat` and `~/projects/assets-service`.
- Use bucket `allgroups-chat` for both environments. Development uses prefix `development`; production uses the bucket root. Both use `https://assets.allgroups.chat` as the public base URL, while existing `group-images/` objects remain untouched.

## Approach

- Add idempotent Zitadel automation with a read-only `--check` mode for the dedicated machine user, project grant, and PAT metadata.
- Register or verify the AllGroups Chat project and development/production bindings in Assets Service using the real Zitadel project ID and R2 configuration.
- Make the AllGroups Chat assets command and documentation work from the Leo checkout without embedding secrets.
- Provision the credential, install it on Leo with restrictive permissions, and verify authenticated project-scoped CLI access.

## Tasks

- [x] 1. Add and test the dedicated AllGroups Chat Assets machine-user provisioning automation in the Zitadel repository.
- [x] 2. Add the minimal AllGroups Chat repository wrapper/configuration documentation for the Leo SSH workflow.
- [x] 3. Provision or verify the live Zitadel identity and AllGroups Chat Assets Service project binding.
- [x] 4. Install the non-secret configuration and protected credential on Leo, then verify CLI access from `~/projects/allgroups-chat`.
