import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"

import type { FixtureServer } from "../src/fixture/fixtureServerCreate.js"
import { fixtureServerCreate } from "../src/fixture/fixtureServerCreate.js"

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
    expect(body.data.assets.map((asset) => asset.class).sort()).toEqual(["document", "font", "image", "video"])
  })

  test("serves every seeded original and output through fixture download routes", async () => {
    const environmentResponse = await get(`/api/v1/projects/${server.seed.serviceProjectId}/environments/development`)
    expect(environmentResponse.status).toBe(200)
    const environment = (await environmentResponse.json()) as { data: { publicBaseUrl: string } }
    expect(environment.data.publicBaseUrl).toBe(origin)
    for (const assetId of server.seed.assetIds) {
      const detail = await get(`/api/v1/projects/${server.seed.serviceProjectId}/assets/${assetId}`)
      expect(detail.status).toBe(200)
      const body = (await detail.json()) as {
        data: {
          sourceHistory: { id: string; originalFilename: string; mediaType: string; byteSize: number }[]
          outputHistory: {
            definition: { key: string }
            versions: { id: string; objectKey: string; mediaType: string; extension: string; byteSize: number }[]
          }[]
        }
      }

      for (const source of body.data.sourceHistory) {
        const original = await get(
          `/api/v1/projects/${server.seed.serviceProjectId}/assets/${assetId}/source-revisions/${source.id}/content`,
        )
        expect(original.status).toBe(200)
        expect(original.headers.get("cache-control")).toBe("private, no-store")
        expect(original.headers.get("content-disposition")).toBe(
          `attachment; filename*=UTF-8''${encodeURIComponent(source.originalFilename)}`,
        )
        expect(original.headers.get("content-length")).toBe(String(source.byteSize))
        expect(original.headers.get("content-type")).toBe(source.mediaType)
        expect(original.headers.get("x-content-type-options")).toBe("nosniff")
        expect((await original.arrayBuffer()).byteLength).toBeGreaterThan(0)
      }

      for (const history of body.data.outputHistory) {
        for (const output of history.versions) {
          const optimized = await server.fetch(new Request(`${environment.data.publicBaseUrl}/${output.objectKey}`))
          expect(optimized.status).toBe(200)
          expect(optimized.headers.get("content-type")).toBe(output.mediaType)
          expect(optimized.headers.get("content-length")).toBe(String(output.byteSize))
          expect(optimized.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
          expect((await optimized.arrayBuffer()).byteLength).toBeGreaterThan(0)

          const downloaded = await get(
            `/api/v1/projects/${server.seed.serviceProjectId}/assets/${assetId}/outputs/${output.id}/content`,
          )
          expect(downloaded.status).toBe(200)
          expect(downloaded.headers.get("cache-control")).toBe("private, no-store")
          expect(downloaded.headers.get("content-disposition")).toBe(
            `attachment; filename*=UTF-8''${history.definition.key}.${output.extension}`,
          )
          expect(downloaded.headers.get("content-length")).toBe(String(output.byteSize))
          expect(downloaded.headers.get("content-type")).toBe(output.mediaType)
          expect(downloaded.headers.get("x-content-type-options")).toBe("nosniff")
          expect((await downloaded.arrayBuffer()).byteLength).toBeGreaterThan(0)
        }
      }
    }
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
