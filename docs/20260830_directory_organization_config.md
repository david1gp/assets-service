# Directory organization configuration

## Goal

Support organization selection from global directory mappings, project `.env` overrides with selectable file paths, and a CLI command that explains the effective configuration and each value's source.

## Decisions

- Store global configuration at `~/.config/assets-service/config.json`, while retaining the existing `~/.config/assets/config.json` as a compatibility fallback.
- Configure only the existing `david` and `contentoren` organizations; do not create or configure an `adaptive` organization and leave `~/adaptive` unmapped.
- Map `~/personal` to `david` and `~/leo` to `contentoren`; use longest containing-directory matching.
- Read the project override from `ASSETS_ORGANIZATION` in the selected environment file.
- Select an env file with `--env-file`, then `ASSETS_ENV_FILE`, otherwise use `<command-root>/.env` or `$PWD/.env`; do not search ancestors.
- Organization precedence is `--organization`, selected `.env`, process `ASSETS_ORGANIZATION`, global directory mapping, then unrestricted resolution.
- Keep `ZITADEL_ORGANIZATION_ID` reserved for server authentication.
- Add `assets config show [root] [--json]`; report paths, loaded state, resolved values, and sources without exposing secrets.

## User-facing configuration

The canonical global file is `~/.config/assets-service/config.json` (under `XDG_CONFIG_HOME` when set):

```json
{
  "organizations": {
    "david": { "id": "<david-organization-id>", "name": "David", "slug": "david" },
    "contentoren": {
      "id": "<contentoren-organization-id>",
      "name": "Contentoren",
      "slug": "contentoren"
    }
  },
  "directoryMappings": {
    "~/personal": "david",
    "~/leo": "contentoren"
  }
}
```

The schema requires the existing `david` and `contentoren` definitions; `adaptive` is not a configured organization and
`~/adaptive` is not mapped. Paths are normalized and matched on containing-directory boundaries, with the longest match
winning. The legacy `~/.config/assets/config.json` is used only when the canonical file is absent. A malformed or
schema-invalid canonical file is an error rather than a reason to use the fallback. A legacy saved CLI configuration at
the fallback path is ignored for organization selection.

The selected environment file is chosen in this order: `--env-file <path>`, `ASSETS_ENV_FILE`, `<command-root>/.env`, or
`$PWD/.env`. Relative explicit paths resolve from the working directory. Explicit files must exist; the default `.env` is
optional, and ancestor directories are not searched. Put `ASSETS_ORGANIZATION=david` (or `contentoren`) in that selected
file for a project override.

Organization precedence is exactly:

1. `--organization`
2. `ASSETS_ORGANIZATION` in the selected `.env`
3. process `ASSETS_ORGANIZATION`
4. the global directory mapping
5. unrestricted resolution

Selectors may be a configured key, organization ID, or slug. `ZITADEL_ORGANIZATION_ID` remains reserved for server
authentication and is not read for CLI organization selection. `assets config show [root] [--json]` defaults `root` to `.`
and reports effective values, paths, loaded state, and sources; its output omits secrets and sanitizes API URLs.

```bash
bun run assets config show .
bun run assets config show ./site --json
bun run assets diff ./site --env-file ./env/site.env
ASSETS_ENV_FILE=./env/site.env bun run assets diff ./site
```

## Approach

- Extract bounded configuration readers/resolvers from the CLI entrypoint and preserve existing project/environment resolution behavior.
- Extend argument parsing and help metadata with organization, env-file, and effective-config options.
- Scope name-based project resolution by the resolved organization while leaving explicit project IDs authoritative.
- Cover configuration parsing, path matching, precedence, project scoping, compatibility fallback, and sanitized diagnostics with tests and documentation.

## Tasks

- [x] 1. Implement and test global config path/schema support and directory-to-organization resolution.
- [x] 2. Implement and test `.env` selection/parsing and organization precedence.
- [x] 3. Apply organization scoping to project resolution and add CLI options/help.
- [x] 4. Implement and test `assets config show [root] [--json]` diagnostics.
- [x] 5. Update user documentation and examples.
- [x] 6. Run focused and full verification; feature checks pass, while three unrelated pre-existing UI structure tests remain failing.
- [x] 7. Correct legacy fallback coexistence for normal CLI commands.
- [x] 8. Correct process-versus-env-file precedence across variable aliases.
- [x] 9. Harden organization selector ownership and injected-home path matching.
- [x] 10. Preserve direct explicit-project-ID resolution under organization scoping.
- [x] 11. Allow organization configuration without directory mappings.
- [x] 12. Correct effective-config fallback file diagnostics.
- [x] 13. Install the requested user configuration without overwriting unrelated settings.
- [x] 14. Re-run final review and verification; feature checks pass, with three unrelated pre-existing UI structure tests still failing.
