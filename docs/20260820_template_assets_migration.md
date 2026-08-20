# Template assets migration

## Goal

Migrate the template.leonardomora.de project’s local assets to the assets service, update source references, deploy the site, and verify production asset loading without browser errors.

## Decisions

- Reuse the existing assets-service production API, `assets-service-public.contentoren.de`, and configured shared R2 bucket.
- Keep service credentials in the assets-service production environment, not in the template project.
- Use a dedicated `template` assets-service project identity; do not upload under the existing `abikur` identity.
- Use `assets diff .` and `assets upload-all .` from the remote template project.
- Preserve font behavior while allowing the public asset origin where required.

## Approach

- Inspect the assets service production/R2 configuration and the remote template project.
- Provision only missing R2 resources and persist required service environment values.
- Upload all template assets, update source paths, and validate the built output.
- Deploy the template project and verify the live site and browser console/network behavior.

## Tasks

- [x] 1. Inspect local assets-service operations/configuration and remote template project/deployment setup.
- [x] 2. Confirm or provision R2 configuration and persist the assets-service production environment.
- [x] 3. Diff and upload all template assets through the assets CLI.
- [x] 4. Update template source asset paths and font/origin handling.
- [x] 5. Build and validate generated output references the public asset locations.
- [x] 6. Deploy the template project.
- [x] 7. Verify the live Cloudflare Pages site loads assets and has no browser errors.

## Paths

- `docs/20260820_template_assets_migration.md`
- `ops/prod/`
- `/home/leo/projects/template`
- `/home/david/adaptive/assets-service`
- `/home/david/leo/contentoren-server`

## Current context

- The remote template project is clean on `main` and uses TanStack Solid Start with `bun run build`.
- Assets live under `images/` and `videos/`; no fonts are currently present, and hand-managed SVGs remain outside the service migration.
- Production URL helpers currently target `assets.template.leonardomora.de`; they must move to the assets-service public host/path returned by upload.
- The remote environment already has API and Cloudflare credentials, but its assets identity is `abikur`; a dedicated `template` identity/config is required.
- The existing shared R2-backed production service should be reused; no new bucket is currently required.
- No Cloudflare Pages project for the template is configured yet.
- The `template` project/environment and a dedicated Zitadel machine identity now exist; leo’s CLI environment is stored at `~/.config/assets-service/template.env` with mode `600`.
- The shared `contentoren-assets-service-public` bucket, custom public host, API readiness, and production API/worker services are healthy.
- Uploaded 62 assets (61 images and 1 video); all public objects return HTTP 200 and the final diff reports 62 matching assets.
- Public object URLs use `https://assets-service-public.contentoren.de/template/public/{objectKey}`.
- Production image/video helpers now map existing generated names to the verified assets-service keys; development URLs and same-origin SVG/poster behavior remain unchanged.
- No font change was needed because the project and uploaded manifest contain no fonts.
- The production build succeeds with 65 prerendered pages; all 30 emitted migrated asset URLs are manifest-backed and no stale `assets.template.leonardomora.de` references remain in source or dist.
- Cloudflare Pages project `template` is deployed successfully at `template-25w.pages.dev`; `template.leonardomora.de` is an active proxied custom domain returning HTTP 200.
- Live browser verification passes on representative desktop/mobile routes: migrated images and video load from the new public host, no stale-host or font requests occur, and the console has no errors.
