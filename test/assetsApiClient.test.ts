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

test("assets API client sends the archived-project opt-in query", async () => {
  let request: Request | undefined
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    sessionCookie: "admin-session-cookie",
    fetcher: async (input, init) => {
      request = new Request(String(input), init)
      return envelopeResponseCreate({ projects: [], page: { limit: 50, nextCursor: null } })
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const projects = await clientResult.data.projectsRead({ includeArchived: true })

  expect(projects).toMatchObject({ success: true, data: { projects: [], page: { nextCursor: null } } })
  expect(request?.url).toBe("https://assets.example.test/api/v1/projects?includeArchived=true")
})

test("assets API client preserves archived opt-in and search across project pages", async () => {
  const requests: Request[] = []
  const projectCreate = (id: string) => ({
    id,
    organizationId: "organization-1",
    name: id,
    slug: id,
    defaultEnvironment: "development" as const,
    archiveState: "archived" as const,
    assetCount: 0,
    totalFileSize: 0,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  })
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    sessionCookie: "admin-session-cookie",
    fetcher: async (input, init) => {
      const request = new Request(String(input), init)
      requests.push(request)
      const cursor = new URL(request.url).searchParams.get("cursor")
      return envelopeResponseCreate({
        projects: [projectCreate(cursor === null ? "project-1" : "project-2")],
        page: { limit: 100, nextCursor: cursor === null ? "100" : null },
      })
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const projects = await clientResult.data.projectsReadAll({ search: "archived", includeArchived: true })

  expect(projects).toMatchObject({ success: true, data: [{ id: "project-1" }, { id: "project-2" }] })
  expect(requests).toHaveLength(2)
  for (const request of requests) {
    const query = new URL(request.url).searchParams
    expect(query.get("includeArchived")).toBe("true")
    expect(query.get("search")).toBe("archived")
    expect(query.get("limit")).toBe("100")
  }
  expect(new URL(requests[0]?.url ?? "https://assets.example.test").searchParams.get("cursor")).toBeNull()
  expect(new URL(requests[1]?.url ?? "https://assets.example.test").searchParams.get("cursor")).toBe("100")
})

test("assets API client archives and unarchives a project with authenticated POST requests", async () => {
  const requests: Request[] = []
  const project = {
    id: "project:1",
    organizationId: "organization-1",
    name: "Example",
    slug: "example",
    defaultEnvironment: "development",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  }
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    accessToken: "admin-token",
    fetcher: async (input, init) => {
      const request = new Request(String(input), init)
      requests.push(request)
      return envelopeResponseCreate(
        request.url.endsWith("/archive")
          ? { project, deletedBuckets: ["bucket-1"], deletedObjectCount: 1 }
          : { project, createdBuckets: ["bucket-1"], restoredOriginalCount: 1, regeneratedOutputCount: 1 },
      )
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const archived = await clientResult.data.projectArchive("project:1")
  const unarchived = await clientResult.data.projectUnarchive("project:1")

  expect(archived).toMatchObject({ success: true, data: { deletedObjectCount: 1 } })
  expect(unarchived).toMatchObject({ success: true, data: { regeneratedOutputCount: 1 } })
  expect(requests.map((request) => [request.method, request.url, request.headers.get("authorization")])).toEqual([
    ["POST", "https://assets.example.test/api/v1/projects/project%3A1/archive", "Bearer admin-token"],
    ["POST", "https://assets.example.test/api/v1/projects/project%3A1/unarchive", "Bearer admin-token"],
  ])
})

test("assets API client returns safe network diagnostics", async () => {
  const token = "network-secret-token"
  const accessToken = "configured-api-token"
  const signedUrl = `https://upload.example.test/object?X-Amz-Signature=${token}`
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    accessToken,
    fetcher: async () => {
      throw new Error(`Failed to fetch ${signedUrl} with ${accessToken} and Bearer ${token}`)
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const result = await clientResult.data.healthRead()

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result).toMatchObject({
    op: "assetsApiClientHealthRead",
    errorMessage: "The assets service could not be reached",
    diagnostics: {
      operation: "assetsApiClientHealthRead",
      kind: "network",
      context: { method: "GET", phase: "request", target: "https://assets.example.test/api/v1/health" },
    },
  })
  expect(JSON.stringify(result)).not.toContain(token)
  expect(JSON.stringify(result)).not.toContain(accessToken)
  expect(JSON.stringify(result)).not.toContain("X-Amz-Signature")
})

test("assets API client returns bounded redacted HTTP diagnostics", async () => {
  const token = "http-secret-token"
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async () =>
      new Response(`upstream token=${token} ${"detail ".repeat(200)}`, {
        status: 503,
        statusText: "Service Unavailable",
      }),
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const result = await clientResult.data.healthRead()

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result).toMatchObject({
    errorMessage: "The assets service returned an error",
    diagnostics: {
      kind: "http",
      status: 503,
      context: { statusText: "Service Unavailable" },
    },
  })
  const diagnostics = result.diagnostics as { responseDetail?: string }
  expect(diagnostics.responseDetail?.length).toBeLessThanOrEqual(500)
  expect(JSON.stringify(result)).not.toContain(token)
})

test("assets API client returns safe diagnostics for malformed responses", async () => {
  const token = "malformed-secret-token"
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async () => new Response(`not-json token=${token} ${"x".repeat(1000)}`, { status: 200 }),
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const result = await clientResult.data.healthRead()

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result).toMatchObject({
    errorMessage: "The assets service returned invalid JSON",
    diagnostics: { kind: "invalid-response", status: 200, cause: "invalid-json" },
  })
  const diagnostics = result.diagnostics as { responseDetail?: string }
  expect(diagnostics.responseDetail?.length).toBeLessThanOrEqual(500)
  expect(JSON.stringify(result)).not.toContain(token)
})

test("assets API client reads organizations and switches organization", async () => {
  const requests: Request[] = []
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    sessionCookie: "human-session-cookie",
    fetcher: async (input, init) => {
      const req = new Request(String(input), init)
      requests.push(req)
      if (req.url.endsWith("/auth/organizations")) {
        return envelopeResponseCreate({
          organizations: [
            { id: "org-contentoren", name: "Contentoren", current: true, mode: "admin", organizationAdmin: true },
            { id: "org-david", name: "David", current: false, mode: "admin", organizationAdmin: true },
          ],
          currentOrganizationId: "org-contentoren",
        })
      }
      if (req.url.endsWith("/auth/organization")) {
        const body = (await req.json()) as { organizationId: string }
        return envelopeResponseCreate({
          switched: true,
          organizationId: body.organizationId,
          principal: {
            subjectId: "david-1",
            displayName: "David",
            organizationId: body.organizationId,
            mode: "admin",
            organizationAdmin: true,
            method: "human_session",
            grants: [],
            issuedAt: 100,
            expiresAt: 200,
          },
        })
      }
      return envelopeResponseCreate({})
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return

  const orgs = await clientResult.data.authOrganizationsRead()
  expect(orgs.success).toBe(true)
  if (!orgs.success) return
  expect(orgs.data.currentOrganizationId).toBe("org-contentoren")
  expect(orgs.data.organizations).toHaveLength(2)
  expect(requests[0]?.url).toBe("https://assets.example.test/api/v1/auth/organizations")

  const switched = await clientResult.data.authOrganizationSwitch("org-david")
  expect(switched.success).toBe(true)
  if (!switched.success) return
  expect(switched.data.switched).toBe(true)
  expect(switched.data.organizationId).toBe("org-david")
  expect(switched.data.principal.organizationId).toBe("org-david")
  expect(requests[1]?.url).toBe("https://assets.example.test/api/v1/auth/organization")
  expect(requests[1]?.method).toBe("POST")
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

test("assets API client updates an asset integration note", async () => {
  let request: Request | undefined
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    accessToken: "contributor-token",
    fetcher: async (input, init) => {
      request = new Request(String(input), init)
      return envelopeResponseCreate({
        id: "asset-1",
        projectId: "project-1",
        class: "image",
        folders: [],
        filename: "hero.jpg",
        basename: "hero",
        currentSourceRevisionId: "source-1",
        integrationNote: "Usage note",
        sourcePath: "hero.jpg",
        sourceHistory: [],
        outputHistory: [],
        metadata: null,
        createdAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
      })
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const updated = await clientResult.data.assetIntegrationNoteSet("project-1", "asset-1", {
    integrationNote: "Usage note",
  })

  expect(updated).toMatchObject({ success: true, data: { integrationNote: "Usage note" } })
  expect(request?.method).toBe("PATCH")
  expect(request?.url).toBe("https://assets.example.test/api/v1/projects/project-1/assets/asset-1/integration-note")
  expect(request?.headers.get("authorization")).toBe("Bearer contributor-token")
  expect(await request?.clone().json()).toEqual({ integrationNote: "Usage note" })
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
      headers: {
        "content-type": "image/jpeg",
        "content-length": "3",
        "x-amz-meta-sha256": "signed-checksum",
      },
      mediaType: "image/jpeg",
      byteSize: 3,
    },
    new Uint8Array([1, 2, 3]),
  )
  expect(uploaded).toEqual({ success: true, data: true })
  expect(requests[0]?.url).toBe("https://upload.example.test/staging/object")
  expect(requests[0]?.headers.get("authorization")).toBeNull()
  expect(requests[0]?.headers.get("content-type")).toBe("image/jpeg")
  expect(requests[0]?.headers.get("content-length")).toBeNull()
  expect(requests[0]?.headers.get("x-amz-meta-sha256")).toBe("signed-checksum")
})

test("direct uploads return safe diagnostics for network and HTTP failures", async () => {
  const token = "direct-upload-secret"
  const intent = {
    method: "PUT" as const,
    url: `https://upload.example.test/staging/object?X-Amz-Signature=${token}`,
    key: "staging/object",
    expiresAt: "2026-08-17T12:00:00.000Z",
    headers: { "content-type": "image/jpeg" },
    mediaType: "image/jpeg",
    byteSize: 3,
  }

  const networkClientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async () => {
      throw new Error(`Network failed for ${intent.url} token=${token}`)
    },
  })
  expect(networkClientResult.success).toBe(true)
  if (!networkClientResult.success) return
  const networkResult = await networkClientResult.data.uploadObjectPut(intent, new Uint8Array([1, 2, 3]))
  expect(networkResult.success).toBe(false)
  if (networkResult.success) return
  expect(networkResult).toMatchObject({
    errorMessage: "The direct upload could not be reached",
    diagnostics: { operation: "assetsApiClientUploadObjectPut", kind: "network" },
  })
  expect(JSON.stringify(networkResult)).not.toContain(token)

  const httpClientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async () =>
      new Response(`{"headers":{"authorization":"${token}"},"token":"${token}"}`, {
        status: 403,
        statusText: "Forbidden",
      }),
  })
  expect(httpClientResult.success).toBe(true)
  if (!httpClientResult.success) return
  const httpResult = await httpClientResult.data.uploadObjectPut(intent, new Uint8Array([1, 2, 3]))
  expect(httpResult.success).toBe(false)
  if (httpResult.success) return
  expect(httpResult).toMatchObject({
    diagnostics: { kind: "http", status: 403 },
  })
  expect(httpResult.errorMessage).toStartWith("The direct upload was rejected (403): ")
  expect(JSON.stringify(httpResult)).not.toContain(token)
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
