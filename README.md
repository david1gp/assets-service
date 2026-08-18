# @adaptive-ds/assets-service

Process and serve site media from one Bun package. Images, video, fonts, and documents go in, sized and hashed files come out.

The service exposes shared contracts for its API, worker, and two CLIs. Media processing and persistence are added behind those contracts.

## Install

```bash
bun add @adaptive-ds/assets-service
```

## Scripts

```bash
bun run api      # API process
bun run worker   # worker process
bun run assets   # remote CLI
bun run assets-local # local CLI
bun run ops:doctor # production integration checks
bun run ops:migrate # apply SQLite migrations
bun run ops:backup # create and verify an R2 SQLite snapshot
bun run ops:restore # restore a verified SQLite snapshot
bun run ops:reconcile # plan or apply guarded cleanup
bun test         # Bun tests
bun run build    # emit dist/
bun run format   # Biome
bun run release  # git-cliff changelog + tag
```

## Remote CLI

`assets` talks only to the configured service. It never switches to local processing after a request fails.

```bash
bun run assets --help
bun run assets doctor --environment development
bun run assets import ./images --atomicity all_or_nothing
bun run assets upload ./card.png --path home/card.png --integration-note "Home card"
bun run assets list --kind image --include outputs,metadata,history
bun run assets lists --dir src/app/assets
bun run assets lists --check --dir src/app/assets
```

Use `ASSETS_API_URL`, `ASSETS_TOKEN`, `ASSETS_PROJECT`, and `ASSETS_ENVIRONMENT` for non-interactive calls. `--json`
writes one newline-terminated deterministic envelope to stdout. Failed commands return a nonzero exit code.

## Local CLI

`assets-local` processes the configured project filesystem and never falls back to the remote CLI. It keeps state in
`.assets-service/state.json` and writes immutable content-hash-named files below `public/`.

```bash
bun run assets-local --help
bun run assets-local import .
bun run assets-local process
bun run assets-local lists --check
bun run assets-local references --include src
bun run assets-local upload ./card.png --path images/500x500_webp/card.png
```

Use `ASSETS_LOCAL_ROOT`, `ASSETS_LOCAL_STATE_FILE`, and `ASSETS_LOCAL_OUTPUT_DIR` to set
the local defaults. `assets-local upload` requires `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `ASSETS_R2_ENDPOINT`, and an R2 bucket. It verifies the immutable output in R2 before
removing the local source and generated binaries. `assets-local doctor` checks the same endpoint and bucket.

Both CLIs generate `imageList.ts`, `videoList.ts`, and `fontList.ts`, including empty lists. `lists --check` compares
exact UTF-8/LF bytes and exits with code 1 when a file differs.

## Production

Copy `.env.example` to `.env` and replace its placeholders. `compose.production.yml` runs separate API and worker
containers with a persistent SQLite volume. `ops/caddy/assets-service.Caddyfile` is a Caddy reverse-proxy example,
and `ops/systemd` contains separate user units for hosts that do not use Compose.

Read [production configuration](docs/production-configuration.md) before provisioning R2, rclone, Zitadel, or
Telegram. [Operations](docs/operations.md) covers health checks, migrations, backups, restore, reconciliation,
deploys, and recovery.

## Links

- code: https://github.com/david1gp/assets-service
- npm: https://www.npmjs.com/package/@adaptive-ds/assets-service
- issues: https://github.com/david1gp/assets-service/issues

## License

MIT
