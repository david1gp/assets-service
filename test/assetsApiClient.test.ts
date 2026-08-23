import { expect, test } from "bun:test"

import { assetsApiClientCreate } from "../src/api-client/assetsApiClientCreate.js"

const envelopeResponseCreate = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify({ ok: true, data }), { status, headers: { "content-type": "application/json" } })

test("assets API client sends authenticated JSON requests and validates responses", async () => {
  const requests: Request[] = []
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    accessToken: "secret-token",
    fetcher: async (input, init) => {
      requests.push(new Request(String(input), init))
      return envelopeResponseCreate({ status: "ok" })
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return

  const health = await clientResult.data.healthRead()
  expect(health).toEqual({ success: true, data: { status: "ok" } })
  expect(requests[0]?.url).toBe("https://assets.example.test/api/v1/health")
  expect(requests[0]?.headers.get("authorization")).toBeNull()

  const ready = await clientResult.data.readyRead()
  expect(ready.success).toBe(true)
  expect(requests[1]?.headers.get("authorization")).toBeNull()
})

test("assets API client validates upload intent before fetching", async () => {
  let fetchCount = 0
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async () => {
      fetchCount += 1
      return envelopeResponseCreate({})
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return

  const intent = await clientResult.data.uploadIntentCreate("project-1", { originalFilename: "hero.jpg" })
  expect(intent.success).toBe(false)
  expect(fetchCount).toBe(0)
})

test("assets API client reads all matching assets across pages and preserves filters", async () => {
  const assetCreate = (id: string) => ({
    id,
    projectId: "project-1",
    class: "image",
    folders: ["images"],
    filename: `${id}.jpg`,
    basename: id,
    currentSourceRevisionId: `source-${id}`,
    sourcePath: `/images/${id}.jpg`,
    outputCount: 0,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  })
  const firstPage = Array.from({ length: 100 }, (_, index) => assetCreate(`asset-${index}`))
  const secondPage = [assetCreate("asset-100")]
  const requests: Request[] = []
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async (input, init) => {
      const request = new Request(String(input), init)
      requests.push(request)
      const cursor = new URL(request.url).searchParams.get("cursor")
      return envelopeResponseCreate(
        cursor === "100"
          ? { assets: secondPage, page: { limit: 100, nextCursor: null } }
          : { assets: firstPage, page: { limit: 100, nextCursor: "100" } },
      )
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const assets = await clientResult.data.assetsReadAll("project-1", {
    class: "image",
    folder: "images",
    search: "hero",
  })

  expect(assets.success).toBe(true)
  if (!assets.success) return
  expect(assets.data).toHaveLength(101)
  expect(assets.data[0]?.id).toBe("asset-0")
  expect(assets.data[100]?.id).toBe("asset-100")
  expect(requests).toHaveLength(2)
  for (const request of requests) {
    const query = new URL(request.url).searchParams
    expect(query.get("class")).toBe("image")
    expect(query.get("folder")).toBe("images")
    expect(query.get("search")).toBe("hero")
    expect(query.get("limit")).toBe("100")
  }
  expect(new URL(requests[0]?.url ?? "https://assets.example.test").searchParams.get("cursor")).toBeNull()
  expect(new URL(requests[1]?.url ?? "https://assets.example.test").searchParams.get("cursor")).toBe("100")
})

test("assets API client creates an encoded authenticated source content URL", () => {
  const clientResult = assetsApiClientCreate({ apiUrl: "https://assets.example.test/api/v1" })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  expect(clientResult.data.assetSourceRevisionContentUrlCreate("project/1", "asset 1", "source/1")).toBe(
    "https://assets.example.test/api/v1/projects/project%2F1/assets/asset%201/source-revisions/source%2F1/content?mode=download",
  )
  expect(clientResult.data.assetSourceRevisionContentUrlCreate("project/1", "asset 1", "source/1", "preview")).toBe(
    "https://assets.example.test/api/v1/projects/project%2F1/assets/asset%201/source-revisions/source%2F1/content?mode=preview",
  )
})

test("assets API client creates an encoded optimized output content URL", () => {
  const clientResult = assetsApiClientCreate({ apiUrl: "https://assets.example.test/api/v1" })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  expect(clientResult.data.assetOutputVersionContentUrlCreate("project/1", "asset 1", "version/1")).toBe(
    "https://assets.example.test/api/v1/projects/project%2F1/assets/asset%201/outputs/version%2F1/content",
  )
})

test("direct uploads use the signed intent without the service bearer", async () => {
  const requests: Request[] = []
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    accessToken: "service-token",
    fetcher: async (input, init) => {
      requests.push(new Request(String(input), init))
      return new Response(null, { status: 200 })
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return

  const uploaded = await clientResult.data.uploadObjectPut(
    {
      method: "PUT",
      url: "https://upload.example.test/staging/object",
      key: "staging/object",
      expiresAt: "2026-08-17T12:00:00.000Z",
      headers: { "content-type": "image/jpeg" },
      mediaType: "image/jpeg",
      byteSize: 3,
    },
    new Uint8Array([1, 2, 3]),
  )
  expect(uploaded).toEqual({ success: true, data: true })
  expect(requests[0]?.url).toBe("https://upload.example.test/staging/object")
  expect(requests[0]?.headers.get("authorization")).toBeNull()
})

test("assets API client reads exact source revision deletion eligibility", async () => {
  const requests: Request[] = []
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    accessToken: "service-token",
    fetcher: async (input, init) => {
      requests.push(new Request(String(input), init))
      return envelopeResponseCreate({
        sourceRevisionId: "source-1",
        eligible: true,
        checks: {
          sourceIdentity: true,
          verifiedBackup: true,
          successfulWorkflow: true,
          lineageMatchingCurrentOutputs: true,
          currentCatalogInclusion: true,
        },
      })
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const eligibility = await clientResult.data.sourceRevisionDeletionEligibilityRead(
    "project/1",
    "development",
    "source-1",
  )
  expect(eligibility).toMatchObject({ success: true, data: { sourceRevisionId: "source-1", eligible: true } })
  expect(requests[0]?.url).toBe(
    "https://assets.example.test/api/v1/projects/project%2F1/source-revisions/source-1/deletion-eligibility?environment=development",
  )
  expect(requests[0]?.headers.get("authorization")).toBe("Bearer service-token")
})

test("assets API client rejects an invalid eligibility environment before fetching", async () => {
  let fetchCount = 0
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async () => {
      fetchCount += 1
      return envelopeResponseCreate({})
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const eligibility = await clientResult.data.sourceRevisionDeletionEligibilityRead("project-1", "staging", "source-1")
  expect(eligibility.success).toBe(false)
  expect(fetchCount).toBe(0)
})

test("assets API client reads and mutates the project structure with validated requests", async () => {
  const requests: Request[] = []
  const folder = {
    id: "structure-folder-1",
    projectId: "project-1",
    parentId: null,
    name: "images",
    depth: 1,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  }
  const membership = {
    id: "membership-1",
    assetId: "asset-1",
    structureFolderId: folder.id,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  }
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async (input, init) => {
      const request = new Request(String(input), init)
      requests.push(request)
      if (request.url.endsWith("/structure"))
        return envelopeResponseCreate({ folders: [folder], memberships: [membership] })
      if (request.url.endsWith("/structure/folders")) return envelopeResponseCreate(folder, 201)
      const body = (await request.clone().json()) as { structureFolderId: string | null }
      return envelopeResponseCreate(body.structureFolderId === null ? null : membership)
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const structure = await clientResult.data.structureRead("project/1")
  const created = await clientResult.data.structureFolderCreate("project/1", { name: "images" })
  const moved = await clientResult.data.assetStructureFolderMembershipSet("project/1", "asset 1", {
    structureFolderId: folder.id,
  })
  const unassigned = await clientResult.data.assetStructureFolderMembershipSet("project/1", "asset 1", {
    structureFolderId: null,
  })
  const invalid = await clientResult.data.structureFolderCreate("project/1", { name: "" })

  expect(structure.success).toBe(true)
  expect(created.success).toBe(true)
  expect(moved.success).toBe(true)
  expect(unassigned).toEqual({ success: true, data: null })
  expect(invalid.success).toBe(false)
  expect(requests).toHaveLength(4)
  expect(requests[0]?.url).toBe("https://assets.example.test/api/v1/projects/project%2F1/structure")
  expect(requests[1]?.url).toBe("https://assets.example.test/api/v1/projects/project%2F1/structure/folders")
  expect(requests[2]?.url).toBe(
    "https://assets.example.test/api/v1/projects/project%2F1/assets/asset%201/structure-membership",
  )
  expect(requests[3]?.url).toBe(requests[2]?.url)
  expect(requests[1]?.method).toBe("POST")
  expect(requests[2]?.method).toBe("PUT")
  expect(requests[3]?.method).toBe("PUT")
})
