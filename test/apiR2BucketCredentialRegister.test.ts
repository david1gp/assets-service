import { expect, test } from "bun:test"
import { eq } from "drizzle-orm"

import { apiAppCreate } from "../src/api/apiAppCreate.js"
import type { ApiAppOptions } from "../src/api/apiAppOptions.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { sessionCookieCreate } from "../src/authentication/sessionCookieCreate.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"
import type { R2BucketCredentialRepository } from "../src/r2/r2BucketCredentialRepository.js"
import type { R2BucketCredentialCreateInput } from "../src/r2/r2BucketCredentialCreateInputSchema.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { r2BucketCredentialTable } from "../src/infrastructure/db/schema/r2BucketCredentialTable.js"
import { r2BucketCredentialRepositoryCreate } from "../src/r2/r2BucketCredentialRepositoryCreate.js"
import type { StorageBinding } from "../src/storage/storageBindingSchema.js"

const now = 1_700_000_000
const requestId = "r2-register-request"
const credentialInput = {
  bucket: "assets-development",
  accessKeyId: "access-key-secret",
  secretAccessKey: "secret-access-key-secret",
  revocationId: "revocation-secret",
}

const projectCreate = (projectId: string, serviceProjectId: string) => ({
  id: projectId,
  organizationId: "org-1",
  name: projectId,
  slug: projectId,
  defaultEnvironment: "development" as const,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
  serviceProjectId,
})

const projectOne = projectCreate("project-1", "project-service")
const projectTwo = projectCreate("project-2", "project-service-2")

const bindingCreate = (projectId: string, serviceProjectId: string, zitadelProjectId: string) => ({
  id: `binding-${projectId}`,
  projectId,
  organizationId: "org-1",
  zitadelProjectId,
  serviceProjectId,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
})

const bindingOne = bindingCreate("project-1", "project-service", "zitadel-1")
const bindingTwo = bindingCreate("project-2", "project-service-2", "zitadel-2")

const environmentCreate = (projectId: string) => ({
  id: `environment-${projectId}`,
  projectId,
  name: "development" as const,
  r2Bucket: "assets-development",
  r2Prefix: projectId,
  publicBaseUrl: "https://assets.example.test",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
})

const environmentOne = environmentCreate("project-1")
const environmentTwo = environmentCreate("project-2")

const projectRepositoryCreate = (storageBindings: readonly StorageBinding[]): ProjectRepository => ({
  projectsRead: () => ({ success: true, data: [] }),
  projectRead: (identifier) => {
    const project = identifier === "project-service" || identifier === "project-1" ? projectOne : undefined
    const other = identifier === "project-service-2" || identifier === "project-2" ? projectTwo : undefined
    const selected = project ?? other
    if (!selected) return { success: true, data: null }
    const { serviceProjectId: _serviceProjectId, ...result } = selected
    return { success: true, data: result }
  },
  projectBindingRead: (identifier) => ({
    success: true,
    data:
      identifier === bindingOne.projectId || identifier === bindingOne.serviceProjectId
        ? bindingOne
        : identifier === bindingTwo.projectId || identifier === bindingTwo.serviceProjectId
          ? bindingTwo
          : null,
  }),
  environmentsRead: (projectId) => ({
    success: true,
    data: projectId === projectOne.id ? [environmentOne] : projectId === projectTwo.id ? [environmentTwo] : [],
  }),
  environmentRead: (projectId, environment) => ({
    success: true,
    data:
      environment !== "development"
        ? null
        : projectId === projectOne.id
          ? environmentOne
          : projectId === projectTwo.id
            ? environmentTwo
            : null,
  }),
  projectSettingsRead: () => ({ success: true, data: null }),
  projectSettingsWrite: () => ({ success: true, data: null }),
  projectCreate: () => ({ success: false, op: "test", errorMessage: "not used" }),
  organizationRead: () => ({ success: true, data: null }),
  organizationReadBySlug: () => ({ success: true, data: null }),
  projectReadByOrganizationIdAndSlug: () => ({ success: true, data: null }),
  storageBindingsRead: () => ({ success: true, data: storageBindings }),
})

const storageBindingCreate = (projectId: string): StorageBinding => ({
  projectId,
  environment: "development",
  bucket: "assets-development",
  prefix: projectId,
  publicBaseUrl: "https://assets.example.test",
})

const optionsCreate = (input: {
  repository: Pick<R2BucketCredentialRepository, "r2BucketCredentialRead" | "r2BucketCredentialCreate">
  storageBindings?: readonly StorageBinding[]
  grants?: readonly { projectId: string; roles: readonly ("admin" | "contributor")[] }[]
}): ApiAppOptions => {
  const authenticationConfig = {
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
  return {
    authentication: {
      config: authenticationConfig,
      stateStore: memoryPkceStateStoreCreate({ now: () => now * 1000 }),
      sessionStore: memorySessionStoreCreate({ sessionIdCreate: () => "register-session" }),
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
        organizationMembershipRead: async () => ({
          success: true as const,
          data: { isExactMember: false, isOrganizationAdmin: false },
        }),
      },
      jwksClient: { keysRead: async () => ({ success: true as const, data: [] }) },
      serviceBearer: undefined,
      now: () => now * 1000,
    },
    projectRepository: projectRepositoryCreate(input.storageBindings ?? [storageBindingCreate(projectOne.id)]),
    r2BucketCredentialRepository: input.repository,
    requestIdCreate: () => requestId,
  }
}

const sessionCreate = async (
  options: ApiAppOptions,
  grants: readonly { projectId: string; roles: readonly ("admin" | "contributor")[] }[],
) => {
  const session: AuthenticationSession = {
    principal: {
      subjectId: "admin-actor",
      organizationId: "org-1",
      mode: "admin",
      organizationAdmin: false,
      method: "human_session",
      grants: grants.map(({ projectId, roles }) => ({ projectId, roles: [...roles] })),
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

const requestCreate = (cookie: string, body: unknown) =>
  new Request("https://assets.example.test/api/v1/projects/project-service/environments/development/r2-credential", {
    method: "PUT",
    headers: { cookie, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  })

const repositoryCreate = (existing?: ReturnType<typeof credentialCreate>) => {
  const credentials = new Map<string, ReturnType<typeof credentialCreate>>()
  if (existing) credentials.set(existing.bucket, existing)
  let createCalls = 0
  const repository: Pick<R2BucketCredentialRepository, "r2BucketCredentialRead" | "r2BucketCredentialCreate"> = {
    r2BucketCredentialRead: (bucket) => ({ success: true, data: credentials.get(bucket) ?? null }),
    r2BucketCredentialCreate: (input) => {
      createCalls += 1
      const saved = credentialCreate(input)
      credentials.set(saved.bucket, saved)
      return { success: true, data: saved }
    },
  }
  return { repository, credentials, createCallsRead: () => createCalls }
}

const credentialCreate = (input: R2BucketCredentialCreateInput = credentialInput) => ({
  ...input,
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
})

test("R2 credential registration accepts only the current bucket and returns a secret-free result", async () => {
  const stored = repositoryCreate()
  const options = optionsCreate({ repository: stored.repository })
  const cookie = await sessionCreate(options, [{ projectId: "zitadel-1", roles: ["admin"] }])
  const response = await apiAppCreate(options).fetch(requestCreate(cookie, credentialInput))
  const json = await response.json()

  expect(response.status).toBe(200)
  expect(json).toEqual({
    ok: true,
    data: { projectId: "project-1", environment: "development", bucket: "assets-development", registered: true },
    requestId,
  })
  expect(JSON.stringify(json)).not.toContain("access-key-secret")
  expect(JSON.stringify(json)).not.toContain("secret-access-key-secret")
  expect(JSON.stringify(json)).not.toContain("revocation-secret")
})

test("R2 credential registration rejects a bucket mismatch without exposing submitted credentials", async () => {
  const stored = repositoryCreate()
  const options = optionsCreate({ repository: stored.repository })
  const cookie = await sessionCreate(options, [{ projectId: "zitadel-1", roles: ["admin"] }])
  const response = await apiAppCreate(options).fetch(
    requestCreate(cookie, { ...credentialInput, bucket: "another-bucket" }),
  )
  const json = await response.json()

  expect(response.status).toBe(400)
  expect(json).toMatchObject({ ok: false, error: { code: "validation_failed" } })
  expect(JSON.stringify(json)).not.toContain("access-key-secret")
  expect(JSON.stringify(json)).not.toContain("secret-access-key-secret")
  expect(JSON.stringify(json)).not.toContain("revocation-secret")
  expect(stored.createCallsRead()).toBe(0)
})

test("R2 credential registration denies contributors and cross-project callers", async () => {
  const contributorStored = repositoryCreate()
  const contributorOptions = optionsCreate({ repository: contributorStored.repository })
  const contributorCookie = await sessionCreate(contributorOptions, [
    { projectId: "zitadel-1", roles: ["contributor"] },
  ])
  const contributorResponse = await apiAppCreate(contributorOptions).fetch(
    requestCreate(contributorCookie, credentialInput),
  )
  expect(contributorResponse.status).toBe(403)

  const crossProjectResponse = await apiAppCreate(contributorOptions).fetch(
    new Request(
      "https://assets.example.test/api/v1/projects/project-service-2/environments/development/r2-credential",
      {
        method: "PUT",
        headers: { cookie: contributorCookie, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(credentialInput),
      },
    ),
  )
  expect(crossProjectResponse.status).toBe(403)
})

test("R2 credential registration is safely idempotent for a project-owned bucket", async () => {
  const stored = repositoryCreate(credentialCreate())
  const options = optionsCreate({ repository: stored.repository })
  const cookie = await sessionCreate(options, [{ projectId: "zitadel-1", roles: ["admin"] }])
  const app = apiAppCreate(options)

  const first = await app.fetch(requestCreate(cookie, credentialInput))
  const second = await app.fetch(requestCreate(cookie, credentialInput))

  expect(first.status).toBe(200)
  expect(second.status).toBe(200)
  expect(stored.createCallsRead()).toBe(2)
})

test("R2 credential registration fails closed on a shared bucket without every project admin grant", async () => {
  const stored = repositoryCreate(credentialCreate())
  const options = optionsCreate({
    repository: stored.repository,
    storageBindings: [storageBindingCreate(projectOne.id), storageBindingCreate(projectTwo.id)],
  })
  const cookie = await sessionCreate(options, [{ projectId: "zitadel-1", roles: ["admin"] }])
  const response = await apiAppCreate(options).fetch(requestCreate(cookie, credentialInput))
  const json = await response.json()

  expect(response.status).toBe(409)
  expect(json).toMatchObject({ ok: false, error: { code: "conflict" } })
  expect(JSON.stringify(json)).not.toContain("access-key-secret")
  expect(JSON.stringify(json)).not.toContain("secret-access-key-secret")
  expect(JSON.stringify(json)).not.toContain("revocation-secret")
  expect(stored.createCallsRead()).toBe(0)
})

test("R2 credential first registration fails closed without every project admin grant", async () => {
  const stored = repositoryCreate()
  const options = optionsCreate({
    repository: stored.repository,
    storageBindings: [storageBindingCreate(projectOne.id), storageBindingCreate(projectTwo.id)],
  })
  const cookie = await sessionCreate(options, [{ projectId: "zitadel-1", roles: ["admin"] }])
  const response = await apiAppCreate(options).fetch(requestCreate(cookie, credentialInput))
  const json = await response.json()

  expect(response.status).toBe(409)
  expect(json).toMatchObject({ ok: false, error: { code: "conflict" } })
  expect(JSON.stringify(json)).not.toContain("access-key-secret")
  expect(JSON.stringify(json)).not.toContain("secret-access-key-secret")
  expect(JSON.stringify(json)).not.toContain("revocation-secret")
  expect(stored.createCallsRead()).toBe(0)
})

test("R2 credential registration permits a shared bucket when the subject administers every project", async () => {
  const stored = repositoryCreate(credentialCreate())
  const options = optionsCreate({
    repository: stored.repository,
    storageBindings: [storageBindingCreate(projectOne.id), storageBindingCreate(projectTwo.id)],
  })
  const cookie = await sessionCreate(options, [
    { projectId: "zitadel-1", roles: ["admin"] },
    { projectId: "zitadel-2", roles: ["admin"] },
  ])
  const response = await apiAppCreate(options).fetch(requestCreate(cookie, credentialInput))

  expect(response.status).toBe(200)
  expect(stored.createCallsRead()).toBe(1)
})

test("R2 credential registration persists encrypted credentials through the repository", async () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return
  try {
    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    const repository = r2BucketCredentialRepositoryCreate(opened.data.db, { encryptionKey: "test-master-key" })
    const options = optionsCreate({ repository })
    const cookie = await sessionCreate(options, [{ projectId: "zitadel-1", roles: ["admin"] }])
    const response = await apiAppCreate(options).fetch(requestCreate(cookie, credentialInput))
    expect(response.status).toBe(200)

    const stored = opened.data.db
      .select()
      .from(r2BucketCredentialTable)
      .where(eq(r2BucketCredentialTable.bucket, credentialInput.bucket))
      .get()
    expect(stored).toBeDefined()
    expect(stored?.accessKeyIdCiphertext).not.toContain(credentialInput.accessKeyId)
    expect(stored?.secretAccessKeyCiphertext).not.toContain(credentialInput.secretAccessKey)
    expect(repository.r2BucketCredentialRead(credentialInput.bucket)).toMatchObject({
      success: true,
      data: credentialInput,
    })
  } finally {
    databaseClose(opened.data)
  }
})

test("R2 credential registration accepts imported credentials without a revocation ID", async () => {
  const importedInput = { ...credentialInput, revocationId: null }
  const stored = repositoryCreate()
  const options = optionsCreate({ repository: stored.repository })
  const cookie = await sessionCreate(options, [{ projectId: "zitadel-1", roles: ["admin"] }])
  const response = await apiAppCreate(options).fetch(requestCreate(cookie, importedInput))
  const json = await response.json()

  expect(response.status).toBe(200)
  expect(json).toEqual({
    ok: true,
    data: { projectId: "project-1", environment: "development", bucket: "assets-development", registered: true },
    requestId,
  })
  expect(JSON.stringify(json)).not.toContain(importedInput.accessKeyId)
  expect(JSON.stringify(json)).not.toContain(importedInput.secretAccessKey)
  expect(stored.credentials.get(importedInput.bucket)?.revocationId).toBeNull()
})
