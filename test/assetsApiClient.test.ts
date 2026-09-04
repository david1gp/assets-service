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

test("assets API client validates the server-derived session mode", async () => {
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    sessionCookie: "human-session-cookie",
    fetcher: async () =>
      envelopeResponseCreate({
        authenticated: true,
        principal: {
          subjectId: "human-1",
          organizationId: "org-customers",
          mode: "contributor",
          organizationAdmin: false,
          method: "human_session",
          grants: [{ projectId: "project-1", roles: ["contributor"] }],
          issuedAt: 1,
          expiresAt: 2,
        },
      }),
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return

  const session = await clientResult.data.authSessionRead()
  expect(session).toMatchObject({
    success: true,
    data: { authenticated: true, principal: { organizationId: "org-customers", mode: "contributor" } },
  })
})

test("assets API client registers a project with an authenticated JSON request", async () => {
  let request: Request | undefined
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    accessToken: "admin-token",
    fetcher: async (input, init) => {
      request = new Request(String(input), init)
      return envelopeResponseCreate({
        project: {
          project: {
            id: "project-1",
            organizationId: "org-1",
            name: "Registered",
            slug: "registered",
            defaultEnvironment: "development",
            createdAt: "2026-08-17T00:00:00.000Z",
            updatedAt: "2026-08-17T00:00:00.000Z",
          },
          organization: null,
          binding: {
            id: "binding-1",
            projectId: "project-1",
            organizationId: "org-1",
            zitadelProjectId: "zitadel-1",
            serviceProjectId: "service-1",
            createdAt: "2026-08-17T00:00:00.000Z",
            updatedAt: "2026-08-17T00:00:00.000Z",
          },
          environments: [
            {
              id: "environment-development",
              projectId: "project-1",
              name: "development",
              r2Bucket: "assets-development",
              r2Prefix: "service-1",
              publicBaseUrl: "https://development.assets.example.test",
              createdAt: "2026-08-17T00:00:00.000Z",
              updatedAt: "2026-08-17T00:00:00.000Z",
            },
            {
              id: "environment-production",
              projectId: "project-1",
              name: "production",
              r2Bucket: "assets-production",
              r2Prefix: "service-1",
              publicBaseUrl: "https://assets.example.test",
              createdAt: "2026-08-17T00:00:00.000Z",
              updatedAt: "2026-08-17T00:00:00.000Z",
            },
          ],
        },
        created: true,
      })
    },
  })
  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return

  const created = await clientResult.data.projectCreate({
    organization: { id: "org-1", name: "Example", slug: "example" },
    name: "Registered",
    slug: "registered",
    defaultEnvironment: "development",
    binding: { zitadelProjectId: "zitadel-1", serviceProjectId: "service-1" },
    environments: [
      {
        name: "development",
        r2Bucket: "assets-development",
        r2Prefix: "service-1",
        publicBaseUrl: "https://development.assets.example.test",
      },
      {
        name: "production",
        r2Bucket: "assets-production",
        r2Prefix: "service-1",
        publicBaseUrl: "https://assets.example.test",
      },
    ],
  })

  expect(created).toMatchObject({ success: true, data: { created: true, project: { project: { id: "project-1" } } } })
  expect(request?.method).toBe("POST")
  expect(request?.url).toBe("https://assets.example.test/api/v1/projects")
  expect(request?.headers.get("authorization")).toBe("Bearer admin-token")
  expect(await request?.clone().json()).toMatchObject({ binding: { serviceProjectId: "service-1" } })
})

test("assets API client sends session cookie for project registration when configured", async () => {
  let request: Request | undefined
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    sessionCookie: "human-session-cookie",
    fetcher: async (input, init) => {
      request = new Request(String(input), init)
      return envelopeResponseCreate({
        project: {
          project: {
            id: "project-1",
            organizationId: "org-1",
            name: "Registered",
            slug: "registered",
            defaultEnvironment: "development",
            createdAt: "2026-08-17T00:00:00.000Z",
            updatedAt: "2026-08-17T00:00:00.000Z",
          },
          organization: null,
          binding: {
            id: "binding-1",
            projectId: "project-1",
            organizationId: "org-1",
            zitadelProjectId: "zitadel-1",
            serviceProjectId: "service-1",
            createdAt: "2026-08-17T00:00:00.000Z",
            updatedAt: "2026-08-17T00:00:00.000Z",
          },
          environments: [
            {
              id: "environment-development",
              projectId: "project-1",
              name: "development",
              r2Bucket: "assets-development",
              r2Prefix: "service-1",
              publicBaseUrl: "https://development.assets.example.test",
              createdAt: "2026-08-17T00:00:00.000Z",
              updatedAt: "2026-08-17T00:00:00.000Z",
            },
            {
              id: "environment-production",
              projectId: "project-1",
              name: "production",
              r2Bucket: "assets-production",
              r2Prefix: "service-1",
              publicBaseUrl: "https://assets.example.test",
              createdAt: "2026-08-17T00:00:00.000Z",
              updatedAt: "2026-08-17T00:00:00.000Z",
            },
          ],
        },
        created: true,
      })
    },
  })
  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return

  const created = await clientResult.data.projectCreate({
    organization: { id: "org-1", name: "Example", slug: "example" },
    name: "Registered",
    slug: "registered",
    defaultEnvironment: "development",
    binding: { zitadelProjectId: "zitadel-1", serviceProjectId: "service-1" },
    environments: [
      {
        name: "development",
        r2Bucket: "assets-development",
        r2Prefix: "service-1",
        publicBaseUrl: "https://development.assets.example.test",
      },
      {
        name: "production",
        r2Bucket: "assets-production",
        r2Prefix: "service-1",
        publicBaseUrl: "https://assets.example.test",
      },
    ],
  })

  expect(created).toMatchObject({ success: true, data: { created: true } })
  expect(request?.headers.get("authorization")).toBeNull()
  expect(request?.headers.get("cookie")).toBe("human-session-cookie")
})

test("assets API client rejects project registration without both environments before fetching", async () => {
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

  const created = await clientResult.data.projectCreate({
    organization: { id: "org-1", name: "Example", slug: "example" },
    name: "Registered",
    slug: "registered",
    defaultEnvironment: "development",
    binding: { zitadelProjectId: "zitadel-1", serviceProjectId: "service-1" },
    environments: [
      {
        name: "development",
        r2Bucket: "assets-development",
        publicBaseUrl: "https://development.assets.example.test",
      },
    ],
  })
  expect(created.success).toBe(false)
  expect(fetchCount).toBe(0)
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

test("assets API client rebuilds only the production catalog", async () => {
  const requests: Request[] = []
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    accessToken: "admin-token",
    fetcher: async (input, init) => {
      requests.push(new Request(String(input), init))
      return envelopeResponseCreate({
        id: "catalog-project-1-production",
        generationId: "generation-1",
        current: true,
        catalog: {
          schema: "assets.catalog.v1",
          projectId: "project-1",
          environment: "production",
          digest: "a".repeat(64),
          rendererVersion: "assets-service.catalog.v1",
          generatedAt: "2026-08-31T00:00:00.000Z",
          outputs: [],
        },
      })
    },
  })
  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return

  const invalid = await clientResult.data.catalogProductionRebuild("project-1", "development")
  const rebuilt = await clientResult.data.catalogProductionRebuild("project-1", "production")
  expect(invalid.success).toBe(false)
  expect(rebuilt.success).toBe(true)
  expect(requests).toHaveLength(1)
  expect(requests[0]?.method).toBe("POST")
  expect(requests[0]?.url).toBe("https://assets.example.test/api/v1/projects/project-1/catalogs/production/rebuild")
  expect(requests[0]?.headers.get("authorization")).toBe("Bearer admin-token")
})

test("assets API client sends an explicit upload target", async () => {
  let request: Request | undefined
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async (input, init) => {
      request = new Request(String(input), init)
      return envelopeResponseCreate({
        uploadId: "upload-1",
        status: "pending",
        intent: {
          method: "PUT",
          url: "https://upload.example.test/upload-1",
          key: "staging/upload-1",
          expiresAt: "2026-08-17T00:10:00.000Z",
          headers: { "content-length": "3", "content-type": "image/png" },
          mediaType: "image/png",
          byteSize: 3,
        },
      })
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const intent = await clientResult.data.uploadIntentCreate("project-1", {
    assetId: "asset-1",
    originalFilename: "replacement.png",
    folders: ["ignored"],
    integrationNote: "Replacement",
    byteSize: 3,
    mediaType: "image/png",
  })

  expect(intent.success).toBe(true)
  expect(request).toBeDefined()
  expect(await request?.json()).toMatchObject({ assetId: "asset-1" })
})

test("assets API client reprocesses an asset into an explicit environment", async () => {
  let request: Request | undefined
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    accessToken: "admin-token",
    fetcher: async (input, init) => {
      request = new Request(String(input), init)
      return envelopeResponseCreate({
        asset: {
          id: "asset-1",
          projectId: "project-1",
          class: "image",
          folders: ["home"],
          filename: "hero.jpg",
          basename: "hero",
          currentSourceRevisionId: "source-1",
          sourcePath: "home/hero.jpg",
          sourceHistory: [
            {
              id: "source-1",
              assetId: "asset-1",
              revision: 1,
              class: "image",
              originalFilename: "hero.jpg",
              mediaType: "image/jpeg",
              byteSize: 10,
              sha256: "a".repeat(64),
              objectKey: "sources/asset-1/hero.jpg",
              createdAt: "2026-08-17T00:00:00.000Z",
            },
          ],
          outputHistory: [],
          metadata: null,
          createdAt: "2026-08-17T00:00:00.000Z",
          updatedAt: "2026-08-17T00:00:00.000Z",
        },
        workflowId: "workflow-reprocess-1",
      })
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const reprocessed = await clientResult.data.assetReprocess("project-1", "asset-1", {
    environmentId: "environment-production",
  })

  expect(reprocessed).toMatchObject({ success: true, data: { workflowId: "workflow-reprocess-1" } })
  expect(request?.method).toBe("POST")
  expect(request?.url).toBe("https://assets.example.test/api/v1/projects/project-1/assets/asset-1/reprocess")
  expect(request?.headers.get("authorization")).toBe("Bearer admin-token")
  expect(await request?.clone().json()).toEqual({ environmentId: "environment-production" })
})

test("assets API client filters and validates storage migration workflows without asset ids", async () => {
  let request: Request | undefined
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async (input, init) => {
      request = new Request(String(input), init)
      return envelopeResponseCreate({
        workflows: [
          {
            id: "workflow-storage-migration",
            projectId: "project-1",
            assetId: null,
            kind: "storage_migration",
            status: "queued",
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
          },
        ],
        page: { limit: 50, nextCursor: null },
      })
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const workflows = await clientResult.data.workflowListRead("project-1", { kind: "storage_migration" })

  expect(workflows).toMatchObject({
    success: true,
    data: { workflows: [{ assetId: null, kind: "storage_migration" }] },
  })
  expect(new URL(request?.url ?? "https://assets.example.test").searchParams.get("kind")).toBe("storage_migration")
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
