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
]

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
  const scripts = ["ops/start-api.sh", "ops/start-worker.sh", "ops/deploy.sh", "ops/doctor.sh"]
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
