import { mkdir, rm } from "node:fs/promises"

import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { fixtureServerCreate } from "../src/fixture/fixtureServerCreate.js"
import type { FixtureServer } from "../src/fixture/fixtureServerCreate.js"

const origin = "http://127.0.0.1:3021"
const databasePath = `data/fixture-test-${crypto.randomUUID()}.sqlite`

let server: FixtureServer
let cookie: string

const get = (path: string, headers: Record<string, string> = {}) =>
  server.fetch(new Request(`${origin}${path}`, { headers: { cookie, ...headers } }))

beforeAll(async () => {
  await mkdir("data", { recursive: true })
  const created = fixtureServerCreate({ databasePath, origin })
  if (!created.success) throw new Error(created.errorMessage)
  server = created.data
  const session = await server.sessionCookieRead()
  if (!session.success) throw new Error(session.errorMessage)
  cookie = session.data.split(";")[0] ?? ""
})

afterAll(async () => {
  server.close()
  await rm(databasePath, { force: true })
  await rm(`${databasePath}-wal`, { force: true })
  await rm(`${databasePath}-shm`, { force: true })
})

describe("fixture server", () => {
  test("seeds one project with three asset classes", async () => {
    const response = await get(`/api/v1/projects/${server.seed.serviceProjectId}/assets`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { assets: { class: string }[] } }
    expect(body.data.assets.map((asset) => asset.class).sort()).toEqual(["font", "image", "video"])
  })

  test("rejects an unauthenticated request", async () => {
    const response = await server.fetch(new Request(`${origin}/api/v1/projects/${server.seed.serviceProjectId}/assets`))
    expect(response.status).toBe(401)
  })

  test("exposes jobs, backups, catalog, imports, and audit data", async () => {
    for (const path of ["workflows", "jobs", "backups", "imports", "audit-events"]) {
      const response = await get(`/api/v1/projects/${server.seed.serviceProjectId}/${path}`)
      expect(response.status).toBe(200)
    }
    const catalog = await get(`/api/v1/projects/${server.seed.serviceProjectId}/catalogs/development/current`)
    expect(catalog.status).toBe(200)
  })

  test("reads and writes the project settings through the API", async () => {
    const read = await get(`/api/v1/projects/${server.seed.serviceProjectId}/settings`)
    expect(read.status).toBe(200)

    const response = await server.fetch(
      new Request(`${origin}/api/v1/projects/${server.seed.serviceProjectId}/settings`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          name: "Contentoren renamed",
          defaultEnvironment: "development",
          binding: { zitadelProjectId: server.seed.zitadelProjectId, serviceProjectId: server.seed.serviceProjectId },
          environments: [
            {
              name: "development",
              r2Bucket: "assets-development",
              r2Prefix: server.seed.serviceProjectId,
              publicBaseUrl: "https://renamed.fixture.invalid",
            },
          ],
        }),
      }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { project: { name: string } } }
    expect(body.data.project.name).toBe("Contentoren renamed")
  })

  test("replaces the image output set atomically and refuses an empty one", async () => {
    const path = `/api/v1/projects/${server.seed.serviceProjectId}/assets/asset-hero/outputs`
    const replaced = await server.fetch(
      new Request(`${origin}${path}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          outputs: [{ kind: "image", key: "1200x675_webp", width: 1200, height: 675, format: "webp", quality: 80 }],
        }),
      }),
    )
    expect(replaced.status).toBe(200)
    const body = (await replaced.json()) as { data: { outputs: { key: string }[] } }
    expect(body.data.outputs.map((output) => output.key)).toEqual(["1200x675_webp"])

    const empty = await server.fetch(
      new Request(`${origin}${path}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ outputs: [] }),
      }),
    )
    expect(empty.status).toBe(400)
  })

  test("returns a structured 404 for an unknown API route", async () => {
    const response = await get("/api/v1/does-not-exist")
    expect(response.status).toBe(404)
  })
})
