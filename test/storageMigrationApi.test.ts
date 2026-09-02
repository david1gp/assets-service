import { describe, expect, test } from "bun:test"

import { apiAppCreate } from "../src/api/apiAppCreate.js"
import type { ApiAppOptions } from "../src/api/apiAppOptions.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { sessionCookieCreate } from "../src/authentication/sessionCookieCreate.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"
import type { Environment } from "../src/project/environmentSchema.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"
import type { StorageMigrationRepository } from "../src/migration/storageMigrationRepository.js"
import type { StorageMigration } from "../src/migration/storageMigrationSchema.js"
import { assetsApiClientCreate } from "../src/api-client/assetsApiClientCreate.js"

const now = 1_700_000_000
const project = {
  id: "project-1",
  organizationId: "org-1",
  name: "Example",
  slug: "example",
  defaultEnvironment: "development" as const,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
}
const binding = {
  id: "binding-1",
  projectId: project.id,
  organizationId: project.organizationId,
  zitadelProjectId: "zitadel-1",
  serviceProjectId: "project-service",
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
}
const initialEnvironment: Environment = {
  id: "environment-1",
  projectId: project.id,
  name: "development",
  r2Bucket: "source-bucket",
  r2Prefix: "source-prefix",
  publicBaseUrl: "https://source.example.test",
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
}
let environment: Environment = initialEnvironment

const environmentReset = (): void => {
  environment = initialEnvironment
}

const sourceBindingCreate = () => ({
  projectId: environment.projectId,
  environmentId: environment.id,
  environment: environment.name,
  bucket: environment.r2Bucket,
  prefix: environment.r2Prefix,
  publicBaseUrl: environment.publicBaseUrl,
})

const migrationCreate = (idempotencyKey: string, targetPublicBaseUrl: string): StorageMigration => ({
  id: `migration-${idempotencyKey}`,
  projectId: project.id,
  environmentId: environment.id,
  idempotencyKey,
  attempt: 1,
  sourceBinding: sourceBindingCreate(),
  targetBinding: { ...sourceBindingCreate(), publicBaseUrl: targetPublicBaseUrl },
  status: "queued",
  sourceInventoryFingerprint: null,
  progress: {
    phase: "discovering",
    totalObjects: 0,
    discoveredObjects: 0,
    copiedObjects: 0,
    verifiedObjects: 0,
    totalBytes: 0,
    copiedBytes: 0,
    currentObjectKey: null,
  },
  lastError: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  startedAt: null,
  completedAt: null,
})

const projectRepositoryCreate = (): ProjectRepository => ({
  projectsRead: () => ({ success: true, data: [] }),
  projectRead: (identifier) => ({
    success: true,
    data: identifier === project.id || identifier === binding.serviceProjectId ? project : null,
  }),
  projectBindingRead: (identifier) => ({
    success: true,
    data: identifier === binding.serviceProjectId || identifier === project.id ? binding : null,
  }),
  environmentsRead: () => ({ success: true, data: [environment] }),
  environmentRead: (_projectId, identifier) => ({
    success: true,
    data: identifier === environment.id || identifier === environment.name ? environment : null,
  }),
  projectSettingsRead: () => ({ success: true, data: null }),
  projectSettingsWrite: () => ({ success: true, data: null }),
  projectCreate: () => ({
    success: true,
    data: { project: { project, organization: null, binding, environments: [environment] }, created: true },
  }),
  organizationRead: () => ({ success: true, data: null }),
})

const optionsCreate = (
  role: "contributor" | "admin",
  state: { migrations: StorageMigration[]; enqueueCount: number },
) => {
  const config = {
    issuer: "https://zitadel.example.test",
    clientId: "human-client-1",
    redirectUri: "https://assets.example.test/api/v1/auth/callback",
    audience: "assets-api",
    organizationId: "org-1",
    customerOrganizationId: "org-customers",
    projectId: "zitadel-1",
    sessionCookieName: "assets_session",
    stateCookieName: "assets_state",
    sessionTtlSeconds: 3600,
    sessionRotationSeconds: 60,
    clockSkewSeconds: 0,
    jwksCacheTtlSeconds: 60,
  }
  const sessionStore = memorySessionStoreCreate({ sessionIdCreate: () => `${role}-session` })
  const repository: StorageMigrationRepository = {
    storageMigrationCreate: (input) => {
      const migration = migrationCreate(input.idempotencyKey, input.targetBinding.publicBaseUrl)
      state.migrations.push(migration)
      return { success: true, data: migration }
    },
    storageMigrationRead: (migrationId) => ({
      success: true,
      data: state.migrations.find((migration) => migration.id === migrationId) ?? null,
    }),
    storageMigrationReadByIdempotencyKey: (_environmentId, idempotencyKey) => ({
      success: true,
      data: [...state.migrations].reverse().find((migration) => migration.idempotencyKey === idempotencyKey) ?? null,
    }),
    storageMigrationReadActive: (environmentId) => ({
      success: true,
      data:
        state.migrations.find(
          (migration) => migration.environmentId === environmentId && ["queued", "running"].includes(migration.status),
        ) ?? null,
    }),
    storageMigrationOwnershipAssert: () => ({ success: true, data: null }),
    storageMigrationStatusUpdate: () => ({ success: false, op: "test", errorMessage: "not used" }),
    storageMigrationProgressUpdate: () => ({ success: false, op: "test", errorMessage: "not used" }),
    storageMigrationCutover: () => ({ success: false, op: "test", errorMessage: "not used" }),
  }
  return {
    authentication: {
      config,
      stateStore: memoryPkceStateStoreCreate({ now: () => now * 1000 }),
      sessionStore,
      oidcClient: {
        discoveryRead: async () => ({ success: true as const, data: {} as never }),
        authorizationUrlCreate: async () => ({ success: true as const, data: "https://example.test/authorize" }),
        authorizationCodeExchange: async () => ({ success: true as const, data: {} as never }),
        organizationMembershipRead: async () => ({
          success: true as const,
          data: { isExactMember: false, isOrganizationAdmin: false },
        }),
      },
      jwksClient: { keysRead: async () => ({ success: true as const, data: [] }) },
      serviceBearer: undefined,
      now: () => now * 1000,
    },
    projectRepository: projectRepositoryCreate(),
    storageMigrationRepository: repository,
    storageMigrationWorkflowEnqueue: (input) => {
      const existing = [...state.migrations]
        .reverse()
        .find((migration) => migration.idempotencyKey === input.idempotencyKey)
      const active = state.migrations.find(
        (migration) =>
          migration.environmentId === input.environmentId && ["queued", "running"].includes(migration.status),
      )
      if (existing === undefined && active !== undefined)
        return { success: false, op: "test", errorMessage: "An active storage migration already exists" }
      state.enqueueCount += 1
      const migration =
        existing === undefined
          ? migrationCreate(input.idempotencyKey, input.targetBinding.publicBaseUrl)
          : existing.status === "failed" || existing.status === "cancelled"
            ? {
                ...migrationCreate(input.idempotencyKey, input.targetBinding.publicBaseUrl),
                id: `migration-${input.idempotencyKey}-${(existing?.attempt ?? 0) + 1}`,
                attempt: (existing?.attempt ?? 0) + 1,
              }
            : existing
      if (existing === undefined) state.migrations.push(migration)
      else if (migration.id !== existing.id) state.migrations.push(migration)
      return {
        success: true,
        data: { migrationId: migration.id, workflowId: `workflow-storage-migration-${migration.id}` },
      }
    },
    requestIdCreate: () => "migration-request",
  } satisfies ApiAppOptions
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

describe("storage migration API", () => {
  test("authorizes admins, plans inherited fields, and supports domain-only plans", async () => {
    environmentReset()
    const state = { migrations: [], enqueueCount: 0 }
    const adminOptions = optionsCreate("admin", state)
    const adminApp = apiAppCreate(adminOptions)
    const admin = await sessionCreate(adminOptions, "admin")
    const contributorOptions = optionsCreate("contributor", state)
    const contributorApp = apiAppCreate(contributorOptions)
    const contributor = await sessionCreate(contributorOptions, "contributor")
    const unauthenticated = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/plan", "", {
        method: "POST",
        body: JSON.stringify({ r2Bucket: "target-bucket" }),
      }),
    )

    const planned = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/plan", admin, {
        method: "POST",
        body: JSON.stringify({ r2Bucket: "target-bucket", publicBaseUrl: "https://target.example.test" }),
      }),
    )
    const denied = await contributorApp.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/plan", contributor, {
        method: "POST",
        body: JSON.stringify({ r2Bucket: "target-bucket" }),
      }),
    )

    expect(unauthenticated.status).toBe(401)
    expect(planned.status).toBe(200)
    expect(await planned.json()).toMatchObject({
      data: {
        sourceBinding: { bucket: "source-bucket", prefix: "source-prefix" },
        targetBinding: { bucket: "target-bucket", prefix: "source-prefix" },
        copyRequired: true,
      },
    })
    expect(denied.status).toBe(403)

    const domainOnly = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/plan", admin, {
        method: "POST",
        body: JSON.stringify({ publicBaseUrl: "https://domain-only.example.test" }),
      }),
    )
    expect(domainOnly.status).toBe(200)
    expect(await domainOnly.json()).toMatchObject({ data: { copyRequired: false } })
    expect(state.enqueueCount).toBe(0)
  })

  test("validates changes, compares the planned source, and starts idempotently", async () => {
    environmentReset()
    const state = { migrations: [], enqueueCount: 0 }
    const options = optionsCreate("admin", state)
    const app = apiAppCreate(options)
    const admin = await sessionCreate(options, "admin")
    const source = sourceBindingCreate()
    const target = { ...source, publicBaseUrl: "https://target.example.test" }
    const body = { idempotencyKey: "migration-1", sourceBinding: source, targetBinding: target }

    const invalid = await app.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/plan", admin, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    )
    const invalidPrefixPlan = await app.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/plan", admin, {
        method: "POST",
        body: JSON.stringify({ r2Prefix: "invalid//prefix" }),
      }),
    )
    const invalidPrefixStart = await app.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/start", admin, {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "invalid-prefix",
          sourceBinding: source,
          targetBinding: { ...target, prefix: "invalid//prefix" },
        }),
      }),
    )
    const started = await app.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/start", admin, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    )
    const repeated = await app.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/start", admin, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    )

    expect(invalid.status).toBe(400)
    expect(invalidPrefixPlan.status).toBe(400)
    expect(invalidPrefixStart.status).toBe(400)
    expect(started.status).toBe(202)
    expect(repeated.status).toBe(202)
    expect(state.enqueueCount).toBe(2)
    expect(await repeated.json()).toMatchObject({
      data: { accepted: true, migration: { id: "migration-migration-1" } },
    })

    const activeConflict = await app.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/start", admin, {
        method: "POST",
        body: JSON.stringify({
          ...body,
          idempotencyKey: "migration-2",
          targetBinding: { ...target, prefix: "another-prefix" },
        }),
      }),
    )
    const idempotencyConflict = await app.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/start", admin, {
        method: "POST",
        body: JSON.stringify({ ...body, targetBinding: { ...target, prefix: "another-prefix" } }),
      }),
    )
    expect(await activeConflict.clone().json()).toMatchObject({ error: { code: "conflict" } })
    expect(activeConflict.status).toBe(409)
    expect(idempotencyConflict.status).toBe(409)

    environment = { ...environment, r2Bucket: "changed-before-start" }
    const stale = await app.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/start", admin, {
        method: "POST",
        body: JSON.stringify({
          ...body,
          idempotencyKey: "migration-2",
        }),
      }),
    )
    expect(stale.status).toBe(409)
  })

  test("repairs an active idempotent migration before returning success", async () => {
    environmentReset()
    const state = { migrations: [migrationCreate("migration-1", "https://target.example.test")], enqueueCount: 0 }
    const options = optionsCreate("admin", state)
    const app = apiAppCreate(options)
    const admin = await sessionCreate(options, "admin")
    const source = sourceBindingCreate()

    const response = await app.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/start", admin, {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "migration-1",
          sourceBinding: source,
          targetBinding: { ...source, publicBaseUrl: "https://target.example.test" },
        }),
      }),
    )

    expect(response.status).toBe(202)
    expect(state.enqueueCount).toBe(1)
    expect(await response.json()).toMatchObject({
      data: { accepted: true, migration: { id: "migration-migration-1" } },
    })
  })

  test("retries a failed or cancelled migration while retaining the terminal attempt", async () => {
    for (const terminalStatus of ["failed", "cancelled"] as const) {
      environmentReset()
      const failed = { ...migrationCreate("migration-retry", "https://target.example.test"), status: terminalStatus }
      const state = { migrations: [failed], enqueueCount: 0 }
      const options = optionsCreate("admin", state)
      const app = apiAppCreate(options)
      const admin = await sessionCreate(options, "admin")
      const source = sourceBindingCreate()
      const body = {
        idempotencyKey: "migration-retry",
        sourceBinding: source,
        targetBinding: { ...source, publicBaseUrl: "https://target.example.test" },
      }

      const retried = await app.fetch(
        requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/start", admin, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      )
      const repeated = await app.fetch(
        requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/start", admin, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      )

      expect(retried.status).toBe(202)
      expect(repeated.status).toBe(202)
      expect(state.enqueueCount).toBe(2)
      expect(state.migrations).toHaveLength(2)
      expect(state.migrations[0]).toMatchObject({ status: terminalStatus, attempt: 1 })
      expect(state.migrations[1]).toMatchObject({ status: "queued", attempt: 2 })
      expect(await retried.json()).toMatchObject({
        data: { migrationId: state.migrations[1]?.id, migration: { status: "queued", attempt: 2 } },
      })
      expect(await repeated.json()).toMatchObject({
        data: { migrationId: state.migrations[1]?.id, migration: { status: "queued", attempt: 2 } },
      })
    }
  })

  test("keeps the migration id in a structured error after enqueue succeeds", async () => {
    environmentReset()
    const state = { migrations: [], enqueueCount: 0 }
    const options = optionsCreate("admin", state)
    const repository = options.storageMigrationRepository
    if (repository === undefined) return
    const app = apiAppCreate({
      ...options,
      storageMigrationRepository: {
        ...repository,
        storageMigrationRead: () => ({ success: false as const, op: "test", errorMessage: "read failed" }),
      },
    })
    const admin = await sessionCreate(options, "admin")
    const source = sourceBindingCreate()

    const response = await app.fetch(
      requestCreate("/api/v1/projects/project-service/environments/development/storage-migration/start", admin, {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "migration-1",
          sourceBinding: source,
          targetBinding: { ...source, publicBaseUrl: "https://target.example.test" },
        }),
      }),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      error: { code: "internal_error", details: { migrationId: "migration-migration-1" } },
    })
  })

  test("scopes migration status to the authorized project and environment", async () => {
    environmentReset()
    const state = { migrations: [migrationCreate("migration-1", "https://target.example.test")], enqueueCount: 0 }
    const options = optionsCreate("admin", state)
    const app = apiAppCreate(options)
    const admin = await sessionCreate(options, "admin")

    const status = await app.fetch(
      requestCreate(
        "/api/v1/projects/project-service/environments/development/storage-migration/migration-migration-1/status",
        admin,
      ),
    )
    const otherProject = await app.fetch(
      requestCreate(
        "/api/v1/projects/other-project/environments/development/storage-migration/migration-migration-1/status",
        admin,
      ),
    )

    expect(status.status).toBe(200)
    expect(otherProject.status).toBe(404)
  })

  test("client validates requests and uses typed migration endpoints", async () => {
    environmentReset()
    const requests: Request[] = []
    const clientResult = assetsApiClientCreate({
      apiUrl: "https://assets.example.test",
      accessToken: "admin-token",
      fetcher: async (input, init) => {
        const request = new Request(String(input), init)
        requests.push(request)
        if (request.url.endsWith("/plan"))
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                sourceBinding: {
                  projectId: "project-1",
                  environmentId: "environment-1",
                  environment: "development",
                  bucket: "source-bucket",
                  prefix: "source-prefix",
                  publicBaseUrl: "https://source.example.test",
                },
                targetBinding: {
                  projectId: "project-1",
                  environmentId: "environment-1",
                  environment: "development",
                  bucket: "target-bucket",
                  prefix: "source-prefix",
                  publicBaseUrl: "https://source.example.test",
                },
                copyRequired: true,
                idempotencyKey: "migration-1",
                idempotency: {
                  existingMigrationId: null,
                  existingMigrationStatus: null,
                  activeMigrationId: null,
                },
              },
            }),
            { status: 200 },
          )
        if (request.url.endsWith("/start")) {
          const migration = migrationCreate("migration-1", "https://source.example.test")
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                accepted: true,
                migrationId: migration.id,
                workflowId: `workflow-storage-migration-${migration.id}`,
                migration,
              },
            }),
            { status: 202 },
          )
        }
        return new Response(
          JSON.stringify({ ok: true, data: migrationCreate("migration-1", "https://target.example.test") }),
          {
            status: 200,
          },
        )
      },
    })
    expect(clientResult.success).toBe(true)
    if (!clientResult.success) return

    const invalid = await clientResult.data.storageMigrationPlan("project/1", "development", { r2Prefix: "" })
    const invalidPrefix = await clientResult.data.storageMigrationPlan("project/1", "development", {
      r2Prefix: "invalid//prefix",
    })
    const planned = await clientResult.data.storageMigrationPlan("project/1", "development", {
      r2Bucket: "target-bucket",
      idempotencyKey: "migration-1",
    })
    const source = sourceBindingCreate()
    const started = await clientResult.data.storageMigrationStart("project/1", "development", {
      idempotencyKey: "migration-1",
      sourceBinding: source,
      targetBinding: { ...source, publicBaseUrl: "https://target.example.test" },
    })
    const status = await clientResult.data.storageMigrationStatusRead("project/1", "development", "migration/1")
    expect(invalid.success).toBe(true)
    expect(invalidPrefix.success).toBe(false)
    expect(planned.success).toBe(true)
    expect(started.success).toBe(true)
    expect(status.success).toBe(true)
    expect(requests[0]?.url).toBe(
      "https://assets.example.test/api/v1/projects/project%2F1/environments/development/storage-migration/plan",
    )
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer admin-token")
    expect(requests[2]?.method).toBe("POST")
    expect(requests[3]?.url).toBe(
      "https://assets.example.test/api/v1/projects/project%2F1/environments/development/storage-migration/migration%2F1/status",
    )
  })
})
