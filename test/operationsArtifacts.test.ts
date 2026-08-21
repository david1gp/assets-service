import { expect, test } from "bun:test"
import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const artifactPaths = [
  "Dockerfile",
  "compose.production.yml",
  "ops/caddy/assets-service.Caddyfile",
  "ops/systemd/assets-service-api.service",
  "ops/systemd/assets-service-worker.service",
  "ops/deploy.sh",
  "ops/backup.sh",
  "ops/migrate.sh",
  "ops/doctor.sh",
  "ops/reconcile.sh",
  "ops/sqlite-restore.sh",
  "ops/sqlite-snapshot.sh",
  "ops/deploy-contentoren.sh",
]

const deploymentOperations = [
  "frontend:build",
  "frontend:upload",
  "frontend:deploy",
  "backend:build",
  "backend:upload",
  "backend:deploy",
  "deploy",
] as const

const contentorenDeployScript = "/home/david/leo/contentoren-server/assets-service/scripts/deploy.sh"
const contentorenDeployScriptExists = await stat(contentorenDeployScript)
  .then(() => true)
  .catch(() => false)

test("production artifacts define separate API and worker processes with durable health checks", async () => {
  const dockerfile = await readFile(join(root, "Dockerfile"), "utf8")
  const compose = await readFile(join(root, "compose.production.yml"), "utf8")
  const caddy = await readFile(join(root, "ops/caddy/assets-service.Caddyfile"), "utf8")
  const systemdInstall = await readFile(join(root, "ops/systemd/install.bash"), "utf8")
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>
  }
  expect(dockerfile).toContain("COPY package.json bun.lock ./")
  expect(dockerfile).toContain("bun install --frozen-lockfile --production")
  expect(packageJson.scripts?.["ops:reconcile"]).toBe("bash ./ops/reconcile.sh")
  expect(compose).toContain("api:")
  expect(compose).toContain("worker:")
  expect(compose).toContain("assets-service-data:/var/lib/assets-service")
  expect(compose).toContain("/api/v1/health/live")
  expect(compose).toContain("condition: service_healthy")
  expect(caddy).toContain("{$ASSETS_API_HOST}")
  expect(caddy).toContain("{$ASSETS_PUBLISHED_API_PORT}")
  expect(systemdInstall).toContain('ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"')
  expect(systemdInstall).toContain('[[ "$line" == WorkingDirectory=* ]]')
})

test("package scripts expose the canonical split deployment command matrix", async () => {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>
  }

  for (const operation of deploymentOperations) {
    expect(packageJson.scripts?.[operation]).toBe(`bash ./ops/deploy-contentoren.sh ${operation}`)
  }
})

test("the repository deployment adapter delegates to the Contentoren wrapper", async () => {
  const adapter = await readFile(join(root, "ops/deploy-contentoren.sh"), "utf8")

  expect(adapter).toContain(`DEPLOY_SCRIPT="\${CONTENTOREN_DEPLOY_SCRIPT:-${contentorenDeployScript}}"`)
  expect(adapter).toContain('SOURCE_DIR="${ASSETS_SOURCE_DIR:-$ROOT_DIR}"')
  expect(adapter).toContain('export ASSETS_SOURCE_DIR="$SOURCE_DIR"')
  expect(adapter).toContain('exec bash -- "$DEPLOY_SCRIPT" "$@"')
})

const contentorenWrapperTest = async () => {
  const wrapper = await readFile(contentorenDeployScript, "utf8")

  expect(wrapper).toContain(
    "frontend:build | frontend:upload | frontend:deploy | backend:build | backend:upload | backend:deploy | deploy",
  )
  expect(wrapper).toMatch(/frontend_deploy\(\) \{\s+local_build vite:build\s+frontend_upload\s+\}/u)
  expect(wrapper).toMatch(/backend_deploy\(\) \{\s+local_build build\s+backend_upload\s+\}/u)
  expect(wrapper).toMatch(
    /aggregate_deploy\(\) \{\s+backend_deploy\s+frontend_deploy\s+run_migrations\s+activate_services\s+apply_route\s+health_check\s+/u,
  )

  const frontendUploadStart = wrapper.indexOf("frontend_upload() {")
  const backendUploadStart = wrapper.indexOf("backend_upload() {")
  expect(frontendUploadStart).toBeGreaterThanOrEqual(0)
  expect(backendUploadStart).toBeGreaterThan(frontendUploadStart)
  const frontendUpload = wrapper.slice(frontendUploadStart, backendUploadStart)
  expect(frontendUpload).toContain('"$FRONTEND_DIR/" "$SSH_HOST:$SRC_DIR/dist/ui/"')
  expect(frontendUpload).not.toContain("--delete")
  expect(wrapper).not.toContain("ASSETS_BUILD_UI")
}

if (contentorenDeployScriptExists) {
  test("the Contentoren wrapper composes component and aggregate deployment flows", contentorenWrapperTest)
} else {
  test.skip("the Contentoren wrapper composes component and aggregate deployment flows", contentorenWrapperTest)
}

test("operational artifacts never invoke forbidden rclone modes", async () => {
  const contents = await Promise.all(artifactPaths.map(async (path) => readFile(join(root, path), "utf8")))
  expect(contents.join("\n")).not.toMatch(/\brclone\s+(?:sync|bisync)\b/u)
})

test("the example environment contains placeholders and no credential values", async () => {
  const environment = await readFile(join(root, ".env.example"), "utf8")
  expect(environment).toContain("CHANGE_ME")
  expect(environment).toMatch(/R2_SECRET_ACCESS_KEY=CHANGE_ME/u)
  expect(environment).toContain("ASSETS_RCLONE_REMOTE=gdrive_beta")
  expect(environment).toContain("ZITADEL_ISSUER=")
  expect(environment).toContain("ASSETS_TELEGRAM_BOT_TOKEN")
  expect(environment).not.toMatch(/(?:BOT_TOKEN|R2_SECRET_ACCESS_KEY|CLIENT_ID)=sk-[A-Za-z0-9]/u)
})

test("service scripts are executable and systemd units stay separate", async () => {
  const scripts = [
    "ops/start-api.sh",
    "ops/start-worker.sh",
    "ops/deploy.sh",
    "ops/deploy-contentoren.sh",
    "ops/doctor.sh",
  ]
  for (const path of scripts) {
    const mode = (await stat(join(root, path))).mode
    expect(mode & 0o111).not.toBe(0)
  }

  const apiUnit = await readFile(join(root, "ops/systemd/assets-service-api.service"), "utf8")
  const workerUnit = await readFile(join(root, "ops/systemd/assets-service-worker.service"), "utf8")
  expect(apiUnit).toContain("bun run api")
  expect(workerUnit).toContain("bun run worker")
  expect(apiUnit).not.toContain("rsbuild")
  expect(workerUnit).not.toContain("rsbuild")
})
