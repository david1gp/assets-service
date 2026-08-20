# Finalize assets-service production (points 1–6)

## Goal
Close out remaining production work for the deployed assets-service and abikur integration.

## Key facts (from investigation)
- Env push script: `/home/david/leo/leo-server/env/leo_env_push.sh` (no args) → rsyncs `/home/david/leo/leo-server/env/env.conf` to `leo@leo-server:/home/leo/.config/environment.d/env.conf` (SSH port 205), reloads systemd. `env.conf` already contains `ASSETS_API_URL/ENVIRONMENT/PROJECT/TOKEN`.
- Local `package.json` is already `0.2.4`; git tag `v0.2.4` = `a6625646`. Production runs 0.2.2.
- Deploy = `/home/david/leo/contentoren-server/ops/prod/deploy.sh`: `rsync -az --delete` of `$HOME/adaptive/assets-service` → `assets-service@remote:/home/assets-service/src`, then `bun install --frozen-lockfile --ignore-scripts` + `bun run ops:migrate`, restart systemd user services `assets-service-api`/`assets-service-worker`. Not npm/bunx-pinned, so deploying current checkout ships 0.2.4.
- ops/prod scripts live in `~/leo/contentoren-server/ops/prod/` and source `../../shared/lib.sh` and derive `REPO_DIR` from contentoren-server root; reference `../leo-server/rclone/rclone.conf`, `$REPO_DIR/shared/routes.json`.
- abikur URL base hardcoded: `~/leo/abikur/src/app/assets/urlImage.ts:3` = `https://assets-service-public.contentoren.de/abikur/public`.
- Public base config: service `serviceConfigRead.ts` precedence `ASSETS_R2_PUBLIC_BASE_URL` → env-specific; prod value written by `write-service-env.sh:41,98-99` from R2 provisioner `R2_AVATAR_PUBLIC_URL`; seeded per-project via `seed-abikur-project.sh:26-27,87-89`.
- R2 provisioner: `~/leo/contentoren-server/shared/r2-provision.sh` builds host from `R2_ZONE` (default contentoren.de). `assets.abikur.de` not provisioned anywhere.
- Backup: assets-service uses rclone `copyto --immutable` (directory, no --delete) in `src/infrastructure/rclone/rcloneBackupAdapterProduction.ts` + path in `src/backup/rcloneRemotePathCreate.ts`. The tar.gz was manual, not service-produced.

## Decisions
- P1: run env push, validate ASSETS_* land on leo-server.
- P2: move `ops/prod` into `~/adaptive/assets-service/ops/prod`; vendor the needed `shared/lib.sh` and adjust path derivation so scripts work from the assets-service repo. Deploy from the new location afterward.
- P3: ship 0.2.4 via deploy.sh (current checkout is 0.2.4); verify running version in prod.
- P4: provision R2 custom domain `assets.abikur.de` for abikur public bucket; set abikur project `public_base_url` to `https://assets.abikur.de`; update `urlImage.ts`; rebuild+redeploy abikur; verify 200s.
- P5: keep directory-based rclone backup; add a dated parent dir in `rcloneRemotePathCreate.ts` so successive backups retain prior files. Explain tar.gz was manual.
- P6: verify workflow from `leo@leo-server:~/projects/abikur` running `assets diff .` (depends on P1).

## Tasks
1. Env push + validate ASSETS_* on leo-server. [DONE]
2. Deploy 0.2.4 to production from new ops/prod (ships P5 backup change too); verify running version. [DONE - prod now 0.2.4, both services active, health 200]
3. Move ops/prod into assets-service repo, fix shared lib/path deps, keep working. [DONE - originals in contentoren-server still present, remove after deploy verified]
4. [BLOCKED - needs user decision] assets.abikur.de ALREADY EXISTS + SSL active, but bound to a DEDICATED bucket `abikur` (keys `images/optimized/*.webp`, 43 objs), NOT the shared `contentoren-assets-service-public` where the service uploaded (`abikur/public/images/*_default_v1.webp`). Hence 404. Options:
   - A (isolation, matches intent): repoint abikur project env row r2_bucket=abikur, re-upload via service, base https://assets.abikur.de/... . But service requires non-empty r2_prefix → clean root layout needs prefix hack or code change; existing dedicated-bucket objects use different naming.
   - B (low effort): detach assets.abikur.de from `abikur` bucket, attach to shared bucket; base https://assets.abikur.de/abikur/public/... ; exposes whole shared bucket namespace.
   Awaiting user choice before any destructive live-domain change.
5. Add dated parent dir to service rclone backup path (retentive).
6. Verify `assets diff .` from leo@leo-server:~/projects/abikur. [DONE - auth ok, 35 matching/in-sync via bunx assets]

## P4 constraints (confirmed)
- Shared bucket `contentoren-assets-service-public`; abikur isolated by key prefix `abikur/`. R2 custom domain binds whole bucket → URL stays `https://assets.abikur.de/abikur/public/images/...` (prefix cannot be dropped). Also exposes other projects' public keys.
- Requires abikur.de to be a CF zone in same account (verify read-only first).
- Attach via direct CF API POST .../r2/buckets/contentoren-assets-service-public/domains/custom {domain:assets.abikur.de, zoneId, enabled:true, minTLS:1.2}.
- Then set abikur project public_base_url to https://assets.abikur.de/abikur/public AND urlImage.ts base; rebuild+redeploy abikur; verify.

## Paths
- Env: `/home/david/leo/leo-server/env/leo_env_push.sh`, `env.conf`
- Ops: `/home/david/leo/contentoren-server/ops/prod/*`, `shared/lib.sh`, `shared/r2-provision.sh`
- Target ops: `/home/david/adaptive/assets-service/ops/prod/`
- Abikur: `/home/david/leo/abikur/src/app/assets/urlImage.ts`
- Backup code: `/home/david/adaptive/assets-service/src/backup/rcloneRemotePathCreate.ts`, `src/infrastructure/rclone/rcloneBackupAdapterProduction.ts`
