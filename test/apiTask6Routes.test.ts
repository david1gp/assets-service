import { describe, expect, test } from "bun:test"

import { apiAppCreate } from "../src/api/apiAppCreate.js"
import type { ApiAppOptions } from "../src/api/apiAppOptions.js"
import type { AuditApiRepository } from "../src/audit/auditApiRepository.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { sessionCookieCreate } from "../src/authentication/sessionCookieCreate.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"
import type { BackupApiRepository } from "../src/backup/backupApiRepository.js"
import type { CatalogApiRepository } from "../src/catalog/catalogApiRepository.js"
import type { CatalogPublicationService } from "../src/catalog/catalogPublicationService.js"
import type { DeletionApiRepository } from "../src/deletion/deletionApiRepository.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"
import type { UploadApiRepository } from "../src/upload/uploadApiRepository.js"
import type { WorkflowApiRepository } from "../src/workflow/workflowApiRepository.js"

const now = 1_700_000_000
const project = {
  id: "project-1",
  organizationId: "org-1",
  name: "Example",
  slug: "example",
  defaultEnvironment: "development" as const,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
}
const projectListItem = { ...project, assetCount: 0, totalFileSize: 0 }
const binding = {
  id: "binding-1",
  projectId: "project-1",
  organizationId: "org-1",
  zitadelProjectId: "zitadel-1",
  serviceProjectId: "project-service",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
}
const environment = {
  id: "environment-1",
  projectId: "project-1",
  name: "development" as const,
  r2Bucket: "assets-development",
  r2Prefix: "project-service",
  publicBaseUrl: "https://assets.example.test",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
}
const workflow = {
  id: "workflow-1",
  projectId: "project-1",
  assetId: "asset-1",
  kind: "asset_processing" as const,
  status: "failed" as const,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
}
const storageMigrationWorkflow = {
  ...workflow,
  id: "workflow-storage-migration",
  assetId: null,
  kind: "storage_migration" as const,
  status: "queued" as const,
}
const job = {
  id: "job-1",
  workflowId: "workflow-1",
  kind: "verify_original" as const,
  status: "dead" as const,
  availableAt: "2026-08-17T00:00:00.000Z",
  priority: 0,
  attempts: 1,
  retryLimit: 0,
  leaseOwner: null,
  leaseExpiresAt: null,
  heartbeatAt: null,
  idempotencyKey: "job-1",
  payloadSchemaVersion: 1,
  payload: {},
  error: { code: "job_failed" as const, message: "failed", retryable: false },
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
}
const backup = {
  id: "backup-1",
  projectId: "project-1",
  sourceRevisionId: "source-1",
  jobId: "job-1",
  remotePath: "gdrive_beta:backups/org-1/example/assets/home/source-1_hero.jpg",
  byteSize: 10,
  sha256: "a".repeat(64),
  checkResult: "verified" as const,
  completedAt: "2026-08-17T00:00:00.000Z",
}
const catalog = {
  id: "catalog-1",
  generationId: "generation-1",
  current: true,
  catalog: {
    schema: "assets.catalog.v1",
    projectId: "project-1",
    environment: "development" as const,
    digest: "b".repeat(64),
    rendererVersion: "1",
    generatedAt: "2026-08-17T00:00:00.000Z",
    outputs: [],
  },
}
const rebuiltCatalog = {
  ...catalog,
  current: true as const,
  catalog: { ...catalog.catalog, environment: "production" as const },
}
const manifest = {
  id: "manifest-1",
  projectId: "project-1",
  assetId: null,
  catalogGenerationId: "generation-1",
  kind: "catalog" as const,
  schema: "assets.manifest.v1",
  objectKey: "manifests/catalog-1.json",
  byteSize: 10,
  sha256: "c".repeat(64),
  createdAt: "2026-08-17T00:00:00.000Z",
}
const auditEvent = {
  id: "audit-1",
  organizationId: "org-1",
  projectId: "project-1",
  actorId: "actor-1",
  action: "asset.read",
  resourceType: "asset",
  resourceId: "asset-1",
  createdAt: "2026-08-17T00:00:00.000Z",
}
const upload = {
  id: "upload-1",
  projectId: "project-1",
  environmentId: "environment-1",
  originalFilename: "hero.jpg",
  folders: ["home"],
  integrationNote: "Hero",
  byteSize: 10,
  status: "accepted" as const,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
}
const deletionState = {
  id: "deletion-1",
  assetId: "asset-1",
  status: "requested" as const,
  completedSteps: [],
  pendingRemoteObjects: [],
  requestedAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
}

type Received = {
  auditAction?: string
  eligibility?: { projectId: string; environment: string; sourceRevisionId: string }
  rebuildProjectId?: string
}

const projectRepositoryCreate = (): ProjectRepository => ({
  projectsRead: () => ({ success: true, data: [projectListItem] }),
  projectRead: (identifier) => ({
    success: true,
    data: identifier === "project-service" || identifier === "project-1" ? project : null,
  }),
  projectBindingRead: (identifier) => ({ success: true, data: identifier === "project-service" ? binding : null }),
  environmentsRead: () => ({ success: true, data: [environment] }),
  environmentRead: () => ({ success: true, data: environment }),
  projectSettingsRead: () => ({
    success: true,
    data: { project, organization: null, binding, environments: [environment] },
  }),
  projectSettingsWrite: (_identifier, update) => ({
    success: true,
    data: {
      project: { ...project, name: update.name, defaultEnvironment: update.defaultEnvironment },
      organization: null,
      binding: { ...binding, ...update.binding },
      environments: update.environments.map((entry, index) => ({
        ...environment,
        id: `environment-${index + 1}`,
        ...entry,
      })),
    },
  }),
  organizationRead: () => ({ success: true, data: null }),
})

const workflowRepositoryCreate = (): WorkflowApiRepository => ({
  workflowsRead: (_projectId, options) => ({
    success: true,
    data: { items: options.kind === "storage_migration" ? [storageMigrationWorkflow] : [workflow], nextCursor: null },
  }),
  workflowRead: () => ({ success: true, data: { workflow, jobs: [job] } }),
  jobsRead: () => ({ success: true, data: { items: [job], nextCursor: null } }),
  jobRead: () => ({ success: true, data: { job, workflow } }),
  workflowRetry: () => ({
    success: true,
    data: { workflow: { ...workflow, status: "queued" }, jobs: [{ ...job, status: "queued" }] },
  }),
  workflowCancel: () => ({
    success: true,
    data: { workflow: { ...workflow, status: "cancelled" }, jobs: [{ ...job, status: "cancelled" }] },
  }),
  jobRetry: () => ({
    success: true,
    data: { job: { ...job, status: "queued" }, workflow: { ...workflow, status: "queued" } },
  }),
  jobCancel: () => ({
    success: true,
    data: { job: { ...job, status: "cancelled" }, workflow: { ...workflow, status: "cancelled" } },
  }),
})

const backupRepositoryCreate = (): BackupApiRepository => ({
  backupReceiptsRead: () => ({ success: true, data: { items: [backup], nextCursor: null } }),
  backupReceiptRead: () => ({ success: true, data: backup }),
  backupStatusRead: () => ({
    success: true,
    data: { sourceRevisionId: "source-1", status: "verified", receipt: backup },
  }),
  backupAssetStatusRead: () => ({
    success: true,
    data: { sourceRevisionId: "source-1", status: "verified", receipt: backup },
  }),
})

const catalogRepositoryCreate = (): CatalogApiRepository => ({
  catalogCurrentRead: () => ({ success: true, data: catalog }),
  catalogsRead: () => ({ success: true, data: { items: [catalog], nextCursor: null } }),
  catalogRead: () => ({ success: true, data: catalog }),
  catalogListsRead: () => ({
    success: true,
    data: { imageList: "", videoList: "", fontList: "", documentList: "", digest: "d".repeat(64) },
  }),
  manifestsRead: () => ({ success: true, data: { items: [manifest], nextCursor: null } }),
  manifestRead: () => ({ success: true, data: manifest }),
})

const catalogPublicationServiceCreate = (received: Received): CatalogPublicationService => ({
  catalogAssetPublish: async () => ({ success: true, data: rebuiltCatalog }),
  catalogProductionRebuild: async (projectId) => {
    received.rebuildProjectId = projectId
    return { success: true, data: rebuiltCatalog }
  },
})

const auditRepositoryCreate = (received?: Received): AuditApiRepository => ({
  auditEventsRead: (_projectId, options) => {
    if (received && options.action !== undefined) received.auditAction = options.action
    return { success: true, data: { items: [auditEvent], nextCursor: null } }
  },
  auditEventRead: () => ({ success: true, data: auditEvent }),
})

const uploadRepositoryCreate = (): UploadApiRepository => ({
  uploadIntentCreate: async () => ({ success: false, op: "test", errorMessage: "not used" }),
  uploadCompletionComplete: async () => ({ success: false, op: "test", errorMessage: "not used" }),
  uploadsRead: () => ({ success: true, data: { items: [upload], nextCursor: null } }),
  uploadRead: () => ({ success: true, data: upload }),
})

const deletionRepositoryCreate = (received?: Received): DeletionApiRepository => ({
  deletionRequestEnqueue: () => ({
    success: true,
    data: { deletionId: "deletion-1", workflowId: "workflow-1", status: "requested" },
  }),
  deletionStateRead: () => ({ success: true, data: deletionState }),
  sourceRevisionDeletionEligibilityRead: (projectId, environmentName, sourceRevisionId) => {
    if (received) received.eligibility = { projectId, environment: environmentName, sourceRevisionId }
    return {
      success: true,
      data: {
        sourceRevisionId: "source-1",
        eligible: true,
        checks: {
          sourceIdentity: true,
          verifiedBackup: true,
          successfulWorkflow: true,
          lineageMatchingCurrentOutputs: true,
          currentCatalogInclusion: true,
        },
      },
    }
  },
})

const optionsCreate = (role: "contributor" | "admin", received: Received): ApiAppOptions => {
  const authenticationConfig = {
    issuer: "https://zitadel.example.test",
    clientId: "human-client-1",
    redirectUri: "https://assets.example.test/api/v1/auth/callback",
    audience: "assets-api",
    organizationId: "org-1",
    projectId: "zitadel-1",
    sessionCookieName: "assets_session",
    stateCookieName: "assets_state",
    sessionTtlSeconds: 3600,
    sessionRotationSeconds: 60,
    clockSkewSeconds: 0,
    jwksCacheTtlSeconds: 60,
  }
  return {
    authentication: {
      config: authenticationConfig,
      stateStore: memoryPkceStateStoreCreate({ now: () => now * 1000 }),
      sessionStore: memorySessionStoreCreate({ sessionIdCreate: () => `${role}-session-${crypto.randomUUID()}` }),
      oidcClient: {
        discoveryRead: async () => ({
          success: true as const,
          data: {
            issuer: authenticationConfig.issuer,
            authorization_endpoint: "https://example.test/authorize",
            token_endpoint: "https://example.test/token",
            jwks_uri: "https://example.test/keys",
          },
        }),
        authorizationUrlCreate: async () => ({ success: true as const, data: "https://example.test/authorize" }),
        authorizationCodeExchange: async () => ({
          success: true as const,
          data: { access_token: "token", token_type: "Bearer", expires_in: 600 },
        }),
        organizationMembershipRead: async () => ({ success: true as const, data: false }),
      },
      jwksClient: { keysRead: async () => ({ success: true as const, data: [] }) },
      serviceBearer: undefined,
      now: () => now * 1000,
    },
    projectRepository: projectRepositoryCreate(),
    workflowApiRepository: workflowRepositoryCreate(),
    backupApiRepository: backupRepositoryCreate(),
    catalogApiRepository: catalogRepositoryCreate(),
    catalogPublicationService: catalogPublicationServiceCreate(received),
    auditApiRepository: auditRepositoryCreate(received),
    uploadApiRepository: uploadRepositoryCreate(),
    deletionApiRepository: deletionRepositoryCreate(received),
    requestIdCreate: () => "task-6-request",
  }
}

const sessionCreate = async (options: ApiAppOptions, role: "contributor" | "admin") => {
  const session: AuthenticationSession = {
    principal: {
      subjectId: "actor-1",
      organizationId: "org-1",
      organizationAdmin: false,
      method: "human_session",
      grants: [{ projectId: "zitadel-1", roles: [role] }],
      issuedAt: now - 60,
      expiresAt: now + 600,
    },
    createdAt: now - 60,
    expiresAt: now + 600,
    rotateAt: now + 600,
  }
  const created = await options.authentication.sessionStore.create(session)
  if (!created.success) throw new Error(created.errorMessage)
  return sessionCookieCreate(created.data, { name: "assets_session", maxAgeSeconds: 600 })
}

const requestCreate = (path: string, cookie: string, init: RequestInit = {}) =>
  new Request(`https://assets.example.test${path}`, {
    ...init,
    headers: { cookie, "content-type": "application/json", ...(init.headers ?? {}) },
  })

describe("task 6 API routes", () => {
  test("requires authentication across every protected API resource family", async () => {
    const app = apiAppCreate(optionsCreate("contributor", {}))
    const requests: Array<[string, RequestInit?]> = [
      ["/api/v1/projects"],
      ["/api/v1/projects/project-service"],
      ["/api/v1/projects/project-service/settings"],
      ["/api/v1/projects/project-service/environments"],
      ["/api/v1/projects/project-service/environments/development/settings"],
      ["/api/v1/projects/project-service/uploads/intent", { method: "POST", body: "{}" }],
      ["/api/v1/projects/project-service/uploads/upload-1/complete", { method: "POST", body: "{}" }],
      ["/api/v1/projects/project-service/uploads"],
      ["/api/v1/projects/project-service/uploads/upload-1"],
      ["/api/v1/projects/project-service/assets"],
      ["/api/v1/projects/project-service/assets/asset-1"],
      ["/api/v1/projects/project-service/assets/asset-1/history"],
      ["/api/v1/projects/project-service/assets/asset-1/outputs"],
      ["/api/v1/projects/project-service/assets/asset-1/metadata", { method: "PATCH", body: "{}" }],
      ["/api/v1/projects/project-service/assets/asset-1/metadata/unset", { method: "POST", body: "{}" }],
      ["/api/v1/projects/project-service/assets/asset-1/move", { method: "POST", body: "{}" }],
      ["/api/v1/projects/project-service/assets/asset-1/deletion-request", { method: "POST", body: "{}" }],
      ["/api/v1/projects/project-service/assets/asset-1/deletion-status"],
      ["/api/v1/projects/project-service/workflows"],
      ["/api/v1/projects/project-service/workflows/workflow-1"],
      ["/api/v1/projects/project-service/workflows/workflow-1/status"],
      ["/api/v1/projects/project-service/jobs"],
      ["/api/v1/projects/project-service/jobs/job-1"],
      ["/api/v1/projects/project-service/jobs/job-1/status"],
      ["/api/v1/projects/project-service/jobs/job-1/retry", { method: "POST", body: "{}" }],
      ["/api/v1/projects/project-service/backups"],
      ["/api/v1/projects/project-service/backups/backup-1"],
      ["/api/v1/projects/project-service/source-revisions/source-1/deletion-eligibility?environment=development"],
      ["/api/v1/projects/project-service/catalogs/development"],
      ["/api/v1/projects/project-service/catalogs/development/history"],
      ["/api/v1/projects/project-service/catalogs/development/lists"],
      ["/api/v1/projects/project-service/catalogs/production/rebuild", { method: "POST", body: "{}" }],
      ["/api/v1/projects/project-service/manifests"],
      ["/api/v1/projects/project-service/audit-events"],
      ["/api/v1/projects/project-service/audit-events/audit-1"],
    ]
    const responses = await Promise.all(requests.map(([path, init]) => app.fetch(requestCreate(path, "", init))))
    expect(responses.map((response) => response.status)).toEqual(requests.map(() => 401))
  })

  test("protects workflow actions, paginates status reads, and isolates projects", async () => {
    const received = {}
    const uploaderOptions = optionsCreate("contributor", received)
    const uploaderApp = apiAppCreate(uploaderOptions)
    const uploader = await sessionCreate(uploaderOptions, "contributor")
    const list = await uploaderApp.fetch(requestCreate("/api/v1/projects/project-service/workflows?limit=1", uploader))
    const denied = await uploaderApp.fetch(
      requestCreate("/api/v1/projects/project-service/jobs/job-1/retry", uploader, { method: "POST" }),
    )
    const isolated = await uploaderApp.fetch(requestCreate("/api/v1/projects/other-project/workflows", uploader))

    expect(list.status).toBe(200)
    expect((await list.json()) as { data: { page: unknown } }).toMatchObject({
      data: { page: { limit: 1, nextCursor: null } },
    })
    expect(denied.status).toBe(403)
    expect(isolated.status).toBe(404)
  })

  test("lists storage migration workflows through the generic workflow API", async () => {
    const options = optionsCreate("admin", {})
    const app = apiAppCreate(options)
    const admin = await sessionCreate(options, "admin")

    const valid = await app.fetch(
      requestCreate("/api/v1/projects/project-service/workflows?kind=storage_migration", admin),
    )
    const invalid = await app.fetch(
      requestCreate("/api/v1/projects/project-service/workflows?kind=legacy_import", admin),
    )

    expect(valid.status).toBe(200)
    expect(await valid.json()).toMatchObject({
      data: { workflows: [{ id: "workflow-storage-migration", assetId: null, kind: "storage_migration" }] },
    })
    expect(invalid.status).toBe(400)
  })

  test("rejects uploader access to every admin mutation boundary", async () => {
    const options = optionsCreate("contributor", {})
    const app = apiAppCreate(options)
    const uploader = await sessionCreate(options, "contributor")
    const requests: Array<[string, RequestInit]> = [
      ["/api/v1/projects/project-service/settings", {}],
      ["/api/v1/projects/project-service/environments/development/settings", {}],
      ["/api/v1/projects/project-service/assets/asset-1/outputs", { method: "POST", body: "{}" }],
      ["/api/v1/projects/project-service/assets/asset-1/outputs", { method: "PUT", body: "{}" }],
      ["/api/v1/projects/project-service/assets/asset-1/outputs", { method: "DELETE", body: "{}" }],
      ["/api/v1/projects/project-service/assets/asset-1/metadata", { method: "PATCH", body: "{}" }],
      ["/api/v1/projects/project-service/assets/asset-1/metadata/unset", { method: "POST", body: "{}" }],
      ["/api/v1/projects/project-service/assets/asset-1/move", { method: "POST", body: "{}" }],
      ["/api/v1/projects/project-service/assets/asset-1/deletion-request", { method: "POST", body: "{}" }],
      ["/api/v1/projects/project-service/workflows/workflow-1/retry", { method: "POST", body: "{}" }],
      ["/api/v1/projects/project-service/jobs/job-1/cancel", { method: "POST", body: "{}" }],
      ["/api/v1/projects/project-service/audit-events", {}],
      ["/api/v1/projects/project-service/catalogs/production/rebuild", { method: "POST", body: "{}" }],
    ]
    const responses = await Promise.all(requests.map(([path, init]) => app.fetch(requestCreate(path, uploader, init))))
    expect(responses.map((response) => response.status)).toEqual(requests.map(() => 403))
  })

  test("exposes readiness aliases", async () => {
    const options = optionsCreate("admin", {})
    const app = apiAppCreate(options)
    const ready = await app.fetch(new Request("https://assets.example.test/api/v1/health/readiness"))

    expect(ready.status).toBe(200)
    expect(await ready.json()).toMatchObject({ data: { status: "ready", checks: { database: "ready" } } })
  })

  test("exposes repository-backed backup, catalog, upload, deletion, and audit reads", async () => {
    const options = optionsCreate("admin", {})
    const app = apiAppCreate(options)
    const admin = await sessionCreate(options, "admin")
    const paths = [
      "/api/v1/projects/project-service/backups?limit=1",
      "/api/v1/projects/project-service/source-revisions/source-1/backup-status",
      "/api/v1/projects/project-service/source-revisions/source-1/deletion-eligibility?environment=development",
      "/api/v1/projects/project-service/catalogs/development",
      "/api/v1/projects/project-service/catalogs/development/history?limit=1",
      "/api/v1/projects/project-service/catalogs/development/lists",
      "/api/v1/projects/project-service/manifests?limit=1",
      "/api/v1/projects/project-service/uploads?limit=1",
      "/api/v1/projects/project-service/uploads/upload-1",
      "/api/v1/projects/project-service/assets/asset-1/deletion-status",
      "/api/v1/projects/project-service/audit-events?limit=1",
    ]
    const responses = await Promise.all(paths.map((path) => app.fetch(requestCreate(path, admin))))

    expect(responses.map((response) => response.status)).toEqual(paths.map(() => 200))
    const deniedAudit = await app.fetch(
      requestCreate("/api/v1/projects/project-service/audit-events", await sessionCreate(options, "contributor")),
    )
    expect(deniedAudit.status).toBe(403)
  })

  test("rejects catalog generations from a different URL environment", async () => {
    const options = optionsCreate("admin", {})
    const app = apiAppCreate(options)
    const admin = await sessionCreate(options, "admin")
    const detail = await app.fetch(
      requestCreate("/api/v1/projects/project-service/catalogs/production/generations/generation-1", admin),
    )
    const lists = await app.fetch(
      requestCreate("/api/v1/projects/project-service/catalogs/production/generations/generation-1/lists", admin),
    )
    const queryLists = await app.fetch(
      requestCreate("/api/v1/projects/project-service/catalogs/production/lists?generationId=generation-1", admin),
    )
    const valid = await app.fetch(
      requestCreate("/api/v1/projects/project-service/catalogs/development/generations/generation-1/lists", admin),
    )

    expect(detail.status).toBe(404)
    expect(lists.status).toBe(404)
    expect(queryLists.status).toBe(404)
    expect(valid.status).toBe(200)
  })

  test("validates and forwards single and multiple audit action filters", async () => {
    const received: Received = {}
    const options = optionsCreate("admin", received)
    const app = apiAppCreate(options)
    const admin = await sessionCreate(options, "admin")

    const absent = await app.fetch(requestCreate("/api/v1/projects/project-service/audit-events", admin))
    expect(absent.status).toBe(200)
    expect(received.auditAction).toBeUndefined()

    const single = await app.fetch(
      requestCreate("/api/v1/projects/project-service/audit-events?action=asset.created", admin),
    )
    expect(single.status).toBe(200)
    expect(received.auditAction).toBe("asset.created")

    const multiple = await app.fetch(
      requestCreate("/api/v1/projects/project-service/audit-events?action=asset.created%2Casset.deleted", admin),
    )
    expect(multiple.status).toBe(200)
    expect(received.auditAction).toBe("asset.created,asset.deleted")

    const invalid = await app.fetch(
      requestCreate("/api/v1/projects/project-service/audit-events?action=asset.created%2Casset.unknown", admin),
    )
    expect(invalid.status).toBe(400)
  })

  test("validates and scopes the eligibility environment", async () => {
    const received: Received = {}
    const options = optionsCreate("contributor", received)
    const app = apiAppCreate(options)
    const uploader = await sessionCreate(options, "contributor")

    const valid = await app.fetch(
      requestCreate(
        "/api/v1/projects/project-service/source-revisions/source-1/deletion-eligibility?environment=production",
        uploader,
      ),
    )
    const invalid = await app.fetch(
      requestCreate(
        "/api/v1/projects/project-service/source-revisions/source-1/deletion-eligibility?environment=staging",
        uploader,
      ),
    )
    const isolated = await app.fetch(
      requestCreate(
        "/api/v1/projects/other-project/source-revisions/source-1/deletion-eligibility?environment=production",
        uploader,
      ),
    )

    expect(valid.status).toBe(200)
    expect(received.eligibility).toEqual({
      projectId: "project-1",
      environment: "production",
      sourceRevisionId: "source-1",
    })
    expect(invalid.status).toBe(400)
    expect(isolated.status).toBe(404)
  })

  test("allows only admins to rebuild the production catalog", async () => {
    const received: Received = {}
    const adminOptions = optionsCreate("admin", received)
    const adminApp = apiAppCreate(adminOptions)
    const admin = await sessionCreate(adminOptions, "admin")
    const contributorOptions = optionsCreate("contributor", {})
    const contributorApp = apiAppCreate(contributorOptions)
    const contributor = await sessionCreate(contributorOptions, "contributor")

    const rebuilt = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/catalogs/production/rebuild", admin, { method: "POST" }),
    )
    const denied = await contributorApp.fetch(
      requestCreate("/api/v1/projects/project-service/catalogs/production/rebuild", contributor, { method: "POST" }),
    )
    const wrongEnvironment = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/catalogs/development/rebuild", admin, { method: "POST" }),
    )

    expect(rebuilt.status).toBe(200)
    expect(await rebuilt.json()).toMatchObject({ data: { catalog: { environment: "production" } } })
    expect(received.rebuildProjectId).toBe("project-1")
    expect(denied.status).toBe(403)
    expect(wrongEnvironment.status).toBe(400)
  })
})
