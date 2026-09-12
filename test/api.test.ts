import { describe, expect, test } from "bun:test"
import * as v from "valibot"

import { apiAppCreate } from "../src/api/apiAppCreate.js"
import type { ApiAppOptions } from "../src/api/apiAppOptions.js"
import { projectListResponseSchema } from "../src/api-client/projectListResponseSchema.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { sessionCookieCreate } from "../src/authentication/sessionCookieCreate.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"
import type { ZitadelJwk } from "../src/infrastructure/zitadel/zitadelJwk.js"
import { zitadelJwksClientMemoryCreate } from "../src/infrastructure/zitadel/zitadelJwksClientMemoryCreate.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"
import type { ProjectArchiveWorkflow } from "../src/project/projectArchiveWorkflow.js"
import type { ProjectUnarchiveWorkflow } from "../src/project/projectUnarchiveWorkflow.js"

const now = 1_700_000_000

const consoleErrorsCapture = async <T>(operation: () => Promise<T>) => {
  const originalError = console.error
  const entries: unknown[][] = []
  console.error = (...args) => entries.push(args)
  try {
    return { result: await operation(), entries }
  } finally {
    console.error = originalError
  }
}

const base64UrlEncode = (value: Uint8Array | string): string =>
  Buffer.from(typeof value === "string" ? value : value).toString("base64url")

const keyPairCreate = async () =>
  crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )

const serviceTokenCreate = async (
  privateKey: CryptoKey,
  claimsOverride: Record<string, unknown> = {},
): Promise<string> => {
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", kid: "key-1", typ: "JWT" }))
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: authenticationConfig.issuer,
      aud: [authenticationConfig.audience],
      sub: "service-account-1",
      iat: now - 60,
      exp: now + 600,
      "urn:zitadel:iam:org:id": "org-1",
      client_id: "machine-client-1",
      assets_project_grants: { "zitadel-1": ["contributor"] },
      ...claimsOverride,
    }),
  )
  const signingInput = `${header}.${payload}`
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(signingInput))
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`
}

const jwkCreate = async (publicKey: CryptoKey): Promise<ZitadelJwk> => {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey)
  return { ...(jwk as unknown as ZitadelJwk), kid: "key-1", alg: "RS256", use: "sig" }
}

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

const archivedProjectListItem = {
  ...projectListItem,
  id: "project-archived",
  name: "Archived project",
  slug: "archived-project",
  archiveState: "archived" as const,
}

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

const projectRepositoryCreate = (): ProjectRepository => ({
  projectsRead: () => ({ success: true, data: [projectListItem] }),
  projectRead: () => ({ success: true, data: project }),
  projectBindingRead: () => ({ success: true, data: binding }),
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
  projectCreate: () => ({
    success: true,
    data: { project: { project, organization: null, binding, environments: [environment] }, created: true },
  }),
  organizationRead: () => ({ success: true, data: null }),
})

const optionsCreate = (): ApiAppOptions => {
  const sessionStore = memorySessionStoreCreate({ sessionIdCreate: () => "session-1" })
  const stateStore = memoryPkceStateStoreCreate({ now: () => now * 1000 })
  const oidcClient = {
    discoveryRead: async () => ({
      success: true as const,
      data: {
        issuer: authenticationConfig.issuer,
        authorization_endpoint: "https://zitadel.example.test/authorize",
        token_endpoint: "https://zitadel.example.test/token",
        jwks_uri: "https://zitadel.example.test/keys",
      },
    }),
    authorizationUrlCreate: async () => ({
      success: true as const,
      data: "https://zitadel.example.test/authorize?state=one",
    }),
    authorizationCodeExchange: async () => ({
      success: true as const,
      data: { access_token: "token", token_type: "Bearer", expires_in: 600 },
    }),
    organizationMembershipRead: async () => ({
      success: true as const,
      data: { isExactMember: false, isOrganizationAdmin: false },
    }),
  }
  const jwksClient = { keysRead: async () => ({ success: true as const, data: [] }) }
  const options: ApiAppOptions = {
    authentication: {
      config: authenticationConfig,
      stateStore,
      sessionStore,
      oidcClient,
      jwksClient,
      serviceBearer: undefined,
      now: () => now * 1000,
    },
    projectRepository: projectRepositoryCreate(),
    requestIdCreate: () => "request-1",
  }
  return options
}

const sessionCreate = async (
  options: ApiAppOptions,
  role: "contributor" | "admin" = "contributor",
  organizationAdmin = false,
  organizationId = "org-1",
  grantProjectId = "zitadel-1",
  method: "human_session" | "service_account" = "human_session",
) => {
  const session: AuthenticationSession = {
    principal: {
      subjectId: "human-1",
      organizationId,
      mode: organizationId === authenticationConfig.organizationId ? "admin" : "contributor",
      organizationAdmin,
      method,
      grants: organizationAdmin ? [] : [{ projectId: grantProjectId, roles: [role] }],
      issuedAt: now - 60,
      expiresAt: now + 600,
    },
    createdAt: now - 60,
    expiresAt: now + 600,
    rotateAt: now + 600,
  }
  const created = await options.authentication.sessionStore.create(session)
  if (!created.success) throw new Error(created.errorMessage)
  return sessionCookieCreate(created.data, { name: authenticationConfig.sessionCookieName, maxAgeSeconds: 600 })
}

describe("HTTP API", () => {
  test("returns versioned health data and propagates request ids", async () => {
    const app = apiAppCreate(optionsCreate())
    const response = await app.fetch(
      new Request("https://assets.example.test/api/v1/health", { headers: { "x-request-id": "request-1" } }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("x-request-id")).toBe("request-1")
    expect(await response.json()).toEqual({ ok: true, data: { status: "ok" }, requestId: "request-1" })
  })

  test("uses deterministic not-found and method-not-allowed envelopes", async () => {
    const app = apiAppCreate(optionsCreate())
    const notFound = await app.fetch(new Request("https://assets.example.test/api/v1/nope"))
    const method = await app.fetch(new Request("https://assets.example.test/api/v1/health", { method: "POST" }))

    expect(notFound.status).toBe(404)
    expect(await notFound.json()).toMatchObject({ ok: false, error: { code: "not_found", retryable: false } })
    expect(method.status).toBe(405)
    expect(method.headers.get("allow")).toBe("GET")
    expect(await method.json()).toMatchObject({ ok: false, error: { code: "method_not_allowed" } })
  })

  test("logs handled client and server failures with safe request fields", async () => {
    const app = apiAppCreate(optionsCreate())
    const readinessApp = apiAppCreate({
      ...optionsCreate(),
      readinessCheck: () => ({ success: false as const, op: "test", errorMessage: "offline" }),
    })
    const signedQueryToken = "signed-query-token"
    const captured = await consoleErrorsCapture(async () => ({
      client: await app.fetch(
        new Request(`https://assets.example.test/api/v1/nope?X-Amz-Signature=${signedQueryToken}`, {
          headers: { cookie: "session-cookie" },
        }),
      ),
      server: await readinessApp.fetch(new Request("https://assets.example.test/api/v1/ready")),
    }))

    expect(captured.result.client.status).toBe(404)
    expect(captured.result.server.status).toBe(503)
    expect(captured.entries).toHaveLength(2)
    expect(captured.entries[0]?.[0]).toBe("[api/request failed]")
    expect(captured.entries[0]?.[1]).toMatchObject({
      requestId: "request-1",
      method: "GET",
      path: "/api/v1/nope",
      status: 404,
      code: "not_found",
      message: "The requested route was not found",
    })
    expect(captured.entries[1]?.[1]).toMatchObject({
      status: 503,
      code: "service_unavailable",
      message: "The service is not ready",
    })
    expect(JSON.stringify(captured.entries)).not.toContain(signedQueryToken)
    expect(JSON.stringify(captured.entries)).not.toContain("session-cookie")
  })

  test("logs unexpected exceptions safely without exposing them in the response", async () => {
    const secret = "unexpected-secret-token"
    const options = optionsCreate()
    const app = apiAppCreate({
      ...options,
      projectRepository: {
        ...options.projectRepository,
        projectsRead: () => {
          throw new Error(
            `database failure at https://db.example.test/query?token=${secret} Bearer ${secret} cookie=${secret}`,
            { cause: { authorization: secret, cookie: secret, detail: `token=${secret}` } },
          )
        },
      },
    })
    const cookie = await sessionCreate(options)
    const captured = await consoleErrorsCapture(async () =>
      app.fetch(new Request("https://assets.example.test/api/v1/projects", { headers: { cookie } })),
    )

    expect(captured.result.status).toBe(500)
    expect(await captured.result.json()).toEqual({
      ok: false,
      error: { code: "internal_error", message: "An internal error occurred", retryable: true },
      requestId: "request-1",
    })
    expect(captured.entries).toHaveLength(1)
    expect(captured.entries[0]?.[1]).toMatchObject({
      requestId: "request-1",
      method: "GET",
      path: "/api/v1/projects",
      status: 500,
      code: "internal_error",
      errorName: "Error",
    })
    expect(JSON.stringify(captured.entries)).toContain("database failure")
    expect(JSON.stringify(captured.entries)).not.toContain(secret)
    expect(JSON.stringify(captured.result)).not.toContain("database failure")
  })

  test("maps readiness and handler failures to technical envelopes", async () => {
    const readinessApp = apiAppCreate({
      ...optionsCreate(),
      readinessCheck: () => ({ success: false as const, op: "test", errorMessage: "offline" }),
    })
    const readiness = await readinessApp.fetch(new Request("https://assets.example.test/api/v1/ready"))
    const options = optionsCreate()
    const failingApp = apiAppCreate({
      ...options,
      projectRepository: {
        ...options.projectRepository,
        projectsRead: () => {
          throw new Error("database failure")
        },
      },
    })
    const cookie = await sessionCreate(options)
    const failure = await failingApp.fetch(
      new Request("https://assets.example.test/api/v1/projects", { headers: { cookie } }),
    )

    expect(readiness.status).toBe(503)
    expect(await readiness.json()).toMatchObject({ ok: false, error: { code: "service_unavailable", retryable: true } })
    expect(failure.status).toBe(500)
    expect(await failure.json()).toEqual({
      ok: false,
      error: { code: "internal_error", message: "An internal error occurred", retryable: true },
      requestId: "request-1",
    })
  })

  test("requires authentication and enforces the project role", async () => {
    const options = optionsCreate()
    const app = apiAppCreate(options)
    const missing = await app.fetch(new Request("https://assets.example.test/api/v1/projects"))
    const cookie = await sessionCreate(options)
    const projectResponse = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service", { headers: { cookie } }),
    )
    const settingsResponse = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service/settings", { headers: { cookie } }),
    )

    expect(missing.status).toBe(401)
    expect(projectResponse.status).toBe(200)
    expect(await projectResponse.json()).toMatchObject({ ok: true, data: { id: "project-1" } })
    expect(settingsResponse.status).toBe(403)
    expect(await settingsResponse.json()).toMatchObject({ ok: false, error: { code: "forbidden" } })

    const adminOptions = optionsCreate()
    const adminApp = apiAppCreate(adminOptions)
    const adminCookie = await sessionCreate(adminOptions, "admin")
    const adminSettings = await adminApp.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service/settings", {
        headers: { cookie: adminCookie },
      }),
    )
    expect(adminSettings.status).toBe(200)
  })

  test("does not authorize contributors against projects in an archive lifecycle state", async () => {
    const options = optionsCreate()
    options.projectRepository = {
      ...options.projectRepository,
      projectRead: () => ({ success: true, data: { ...project, archiveState: "archived" } }),
    }
    const app = apiAppCreate(options)
    const contributor = await sessionCreate(options)
    const denied = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service", { headers: { cookie: contributor } }),
    )
    expect(denied.status).toBe(403)

    const adminOptions = optionsCreate()
    adminOptions.projectRepository = {
      ...adminOptions.projectRepository,
      projectRead: () => ({ success: true, data: { ...project, archiveState: "archived" } }),
    }
    const adminApp = apiAppCreate(adminOptions)
    const administrator = await sessionCreate(adminOptions, "contributor", true)
    const allowed = await adminApp.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service", {
        headers: { cookie: administrator },
      }),
    )
    expect(allowed.status).toBe(200)
  })

  test("allows project administrators to archive and unarchive, but not contributors", async () => {
    const archiveCalls: string[] = []
    const unarchiveCalls: string[] = []
    const archiveCredentials: unknown[] = []
    const unarchiveCredentials: unknown[] = []
    const options = optionsCreate()
    const archiveWorkflow: ProjectArchiveWorkflow = {
      projectArchive: async (projectId, credentials) => {
        archiveCalls.push(projectId)
        archiveCredentials.push(credentials)
        return { success: true, data: { project, deletedBuckets: ["assets-project"], deletedObjectCount: 2 } }
      },
    }
    const unarchiveWorkflow: ProjectUnarchiveWorkflow = {
      projectUnarchive: async (projectId, credentials) => {
        unarchiveCalls.push(projectId)
        unarchiveCredentials.push(credentials)
        return {
          success: true,
          data: { project, createdBuckets: ["assets-project"], restoredOriginalCount: 1, regeneratedOutputCount: 2 },
        }
      },
    }
    options.projectArchiveWorkflow = archiveWorkflow
    options.projectUnarchiveWorkflow = unarchiveWorkflow
    const app = apiAppCreate(options)
    const contributor = await sessionCreate(options, "contributor")
    const contributorArchive = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service/archive", {
        method: "POST",
        headers: { cookie: contributor },
      }),
    )
    const contributorUnarchive = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service/unarchive", {
        method: "POST",
        headers: { cookie: contributor },
      }),
    )

    expect(contributorArchive.status).toBe(403)
    expect(contributorUnarchive.status).toBe(403)
    expect(archiveCalls).toEqual([])
    expect(unarchiveCalls).toEqual([])

    const administratorOptions = optionsCreate()
    administratorOptions.projectArchiveWorkflow = archiveWorkflow
    administratorOptions.projectUnarchiveWorkflow = unarchiveWorkflow
    const administratorApp = apiAppCreate(administratorOptions)
    const administrator = await sessionCreate(administratorOptions, "admin")
    const archive = await administratorApp.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service/archive", {
        method: "POST",
        headers: { cookie: administrator },
        body: JSON.stringify({ accountId: "account-1", apiToken: "token-1" }),
      }),
    )
    const unarchive = await administratorApp.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service/unarchive", {
        method: "POST",
        headers: { cookie: administrator },
        body: JSON.stringify({ accountId: "account-1", apiToken: "token-1" }),
      }),
    )

    expect(archive.status).toBe(200)
    expect(await archive.json()).toMatchObject({
      ok: true,
      data: { project: { id: "project-1" }, deletedBuckets: ["assets-project"], deletedObjectCount: 2 },
    })
    expect(unarchive.status).toBe(200)
    expect(await unarchive.json()).toMatchObject({
      ok: true,
      data: { project: { id: "project-1" }, createdBuckets: ["assets-project"], restoredOriginalCount: 1 },
    })
    expect(archiveCalls).toEqual(["project-1"])
    expect(unarchiveCalls).toEqual(["project-1"])
    expect(archiveCredentials).toEqual([{ accountId: "account-1", apiToken: "token-1" }])
    expect(unarchiveCredentials).toEqual([{ accountId: "account-1", apiToken: "token-1" }])

    const invalid = await administratorApp.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service/archive", {
        method: "POST",
        headers: { cookie: administrator },
        body: JSON.stringify({ accountId: "account-1" }),
      }),
    )
    expect(invalid.status).toBe(400)
    expect(archiveCredentials).toHaveLength(1)
  })

  test("returns aggregate metrics in the project list contract", async () => {
    const options = optionsCreate()
    options.projectRepository = {
      ...options.projectRepository,
      projectsRead: () => ({ success: true, data: [{ ...projectListItem, assetCount: 2, totalFileSize: 50 }] }),
    }
    const app = apiAppCreate(options)
    const cookie = await sessionCreate(options)
    const response = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects", { headers: { cookie } }),
    )
    const body = (await response.json()) as { data: unknown }
    const parsed = v.safeParse(projectListResponseSchema, body.data)

    expect(response.status).toBe(200)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.output.projects[0]).toMatchObject({ assetCount: 2, totalFileSize: 50 })
  })

  test("normalizes omitted and empty R2 prefixes in settings input", async () => {
    const options = optionsCreate()
    const received: string[][] = []
    const repository = options.projectRepository
    options.projectRepository = {
      ...repository,
      projectSettingsWrite: (identifier, update) => {
        received.push(update.environments.map((environment) => environment.r2Prefix))
        return repository.projectSettingsWrite(identifier, update)
      },
    }
    const app = apiAppCreate(options)
    const cookie = await sessionCreate(options, "admin")
    const response = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service/settings", {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          name: "Example",
          defaultEnvironment: "development",
          binding: { zitadelProjectId: "zitadel-1", serviceProjectId: "project-service" },
          environments: [
            {
              name: "development",
              r2Bucket: "assets-development",
              publicBaseUrl: "https://assets.example.test",
            },
            {
              name: "production",
              r2Bucket: "assets-production",
              r2Prefix: "",
              publicBaseUrl: "https://assets.example.test",
            },
          ],
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(received).toEqual([["", ""]])
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { environments: [{ r2Prefix: "" }, { r2Prefix: "" }] },
    })
  })

  test("passes organization-wide listing only for an organization administrator", async () => {
    let requestedOrganizationAdmin: boolean | undefined
    let requestedIncludeArchived: boolean | undefined
    const options = optionsCreate()
    options.projectRepository = {
      ...options.projectRepository,
      projectsRead: (_organizationId, _zitadelProjectIds, organizationAdmin, includeArchived) => {
        requestedOrganizationAdmin = organizationAdmin
        requestedIncludeArchived = includeArchived
        return { success: true, data: [projectListItem] }
      },
    }
    const app = apiAppCreate(options)
    const administrator = await sessionCreate(options, "contributor", true)
    const administratorResponse = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects?includeArchived=true", {
        headers: { cookie: administrator },
      }),
    )
    expect(administratorResponse.status).toBe(200)
    expect(requestedOrganizationAdmin).toBe(true)
    expect(requestedIncludeArchived).toBe(true)

    const regularOptions = optionsCreate()
    regularOptions.projectRepository = {
      ...regularOptions.projectRepository,
      projectsRead: (_organizationId, _zitadelProjectIds, organizationAdmin, includeArchived) => {
        requestedOrganizationAdmin = organizationAdmin
        requestedIncludeArchived = includeArchived
        return { success: true, data: [projectListItem] }
      },
    }
    const regularApp = apiAppCreate(regularOptions)
    const regular = await sessionCreate(regularOptions)
    const regularResponse = await regularApp.fetch(
      new Request("https://assets.example.test/api/v1/projects?includeArchived=true", { headers: { cookie: regular } }),
    )
    expect(regularResponse.status).toBe(200)
    expect(requestedOrganizationAdmin).toBe(false)
    expect(requestedIncludeArchived).toBe(false)
  })

  test("passes archived listing opt-in for a project administrator", async () => {
    let requestedOrganizationAdmin: boolean | undefined
    let requestedIncludeArchived: boolean | undefined
    let requestedProjectAdministrator: boolean | undefined
    const options = optionsCreate()
    options.projectRepository = {
      ...options.projectRepository,
      projectsRead: (_organizationId, _zitadelProjectIds, organizationAdmin, includeArchived, projectAdministrator) => {
        requestedOrganizationAdmin = organizationAdmin
        requestedIncludeArchived = includeArchived
        requestedProjectAdministrator = projectAdministrator
        return { success: true, data: [projectListItem] }
      },
    }
    const app = apiAppCreate(options)
    const administrator = await sessionCreate(options, "admin")
    const response = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects?includeArchived=true", {
        headers: { cookie: administrator },
      }),
    )

    expect(response.status).toBe(200)
    expect(requestedOrganizationAdmin).toBe(false)
    expect(requestedIncludeArchived).toBe(true)
    expect(requestedProjectAdministrator).toBe(true)
  })

  test("hides archived projects by default and returns them for administrator opt-in", async () => {
    const requested: { organizationAdmin?: boolean; includeArchived?: boolean; projectAdministrator?: boolean }[] = []
    const options = optionsCreate()
    options.projectRepository = {
      ...options.projectRepository,
      projectsRead: (_organizationId, _projectIds, organizationAdmin, includeArchived, projectAdministrator) => {
        requested.push({ organizationAdmin, includeArchived, projectAdministrator })
        return { success: true, data: [projectListItem, archivedProjectListItem] }
      },
    }
    const app = apiAppCreate(options)
    const administrator = await sessionCreate(options, "contributor", true)

    const defaultResponse = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects", { headers: { cookie: administrator } }),
    )
    const optedInResponse = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects?includeArchived=true", {
        headers: { cookie: administrator },
      }),
    )

    expect(defaultResponse.status).toBe(200)
    expect(optedInResponse.status).toBe(200)
    expect((await defaultResponse.json()).data.projects.map((item: { id: string }) => item.id)).toEqual(["project-1"])
    expect((await optedInResponse.json()).data.projects.map((item: { id: string }) => item.id)).toEqual([
      "project-1",
      "project-archived",
    ])
    expect(requested).toEqual([
      { organizationAdmin: true, includeArchived: false, projectAdministrator: false },
      { organizationAdmin: true, includeArchived: true, projectAdministrator: false },
    ])
  })

  test("keeps archived projects out of contributor API responses even when requested", async () => {
    let requestedIncludeArchived: boolean | undefined
    const options = optionsCreate()
    options.projectRepository = {
      ...options.projectRepository,
      projectsRead: (_organizationId, _projectIds, _organizationAdmin, includeArchived) => {
        requestedIncludeArchived = includeArchived
        return { success: true, data: [projectListItem, archivedProjectListItem] }
      },
    }
    const app = apiAppCreate(options)
    const contributor = await sessionCreate(options, "contributor", false, "org-customers", "zitadel-1")
    const response = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects?includeArchived=true", {
        headers: { cookie: contributor },
      }),
    )

    expect(response.status).toBe(200)
    expect((await response.json()).data.projects.map((item: { id: string }) => item.id)).toEqual(["project-1"])
    expect(requestedIncludeArchived).toBe(false)
  })

  test("denies contributors direct access to archived projects", async () => {
    const options = optionsCreate()
    const repository = options.projectRepository
    options.projectRepository = {
      ...repository,
      projectRead: () => ({ success: true, data: { ...project, archiveState: "archived" as const } }),
    }
    const app = apiAppCreate(options)
    const contributor = await sessionCreate(options, "contributor", false, "org-customers", "zitadel-1")
    const response = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service", {
        headers: { cookie: contributor },
      }),
    )

    expect(response.status).toBe(403)
  })

  test("keeps customer contributors on owned bindings and exact contributor grants", async () => {
    const options = optionsCreate()
    const otherProject = { ...project, id: "project-2", name: "Other project" }
    const otherBinding = {
      ...binding,
      id: "binding-2",
      projectId: otherProject.id,
      zitadelProjectId: "zitadel-2",
      serviceProjectId: "project-service-2",
    }
    const requested: { organizationId: string; projectIds: readonly string[]; organizationAdmin?: boolean }[] = []
    const repository = options.projectRepository
    options.projectRepository = {
      ...repository,
      projectsRead: (organizationId, projectIds, organizationAdmin) => {
        requested.push({ organizationId, projectIds, organizationAdmin })
        return { success: true, data: [projectListItem] }
      },
      projectRead: (identifier) =>
        identifier === otherProject.id ? { success: true, data: otherProject } : repository.projectRead(identifier),
      projectBindingRead: (identifier) =>
        identifier === otherBinding.serviceProjectId
          ? { success: true, data: otherBinding }
          : repository.projectBindingRead(identifier),
    }
    const app = apiAppCreate(options)
    const customer = await sessionCreate(options, "contributor", false, "org-customers", "zitadel-2")
    const listed = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects", { headers: { cookie: customer } }),
    )
    const projectResponse = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service", { headers: { cookie: customer } }),
    )
    const settingsResponse = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service/settings", {
        headers: { cookie: customer },
      }),
    )
    const otherProjectResponse = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service-2", { headers: { cookie: customer } }),
    )

    expect(listed.status).toBe(200)
    expect(projectResponse.status).toBe(403)
    expect(settingsResponse.status).toBe(403)
    expect(otherProjectResponse.status).toBe(200)
    expect(requested).toEqual([{ organizationId: "org-1", projectIds: ["zitadel-2"], organizationAdmin: false }])
  })

  test("creates projects only for a human organization administrator and passes the subject for the grant record", async () => {
    let receivedSubject: string | undefined
    let receivedInput: unknown
    const options = optionsCreate()
    const repository = options.projectRepository
    options.projectRepository = {
      ...repository,
      projectCreate: (input, subjectId) => {
        receivedInput = input
        receivedSubject = subjectId
        return {
          success: true,
          data: {
            project: { project, organization: null, binding, environments: [environment] },
            created: true,
          },
        }
      },
    }
    const app = apiAppCreate(options)
    const administrator = await sessionCreate(options, "contributor", true)
    const body = {
      organization: { id: "org-1", name: "Example", slug: "example" },
      name: "Registered",
      slug: "registered",
      defaultEnvironment: "development",
      binding: { zitadelProjectId: "zitadel-registered", serviceProjectId: "service-registered" },
      environments: [
        {
          name: "development",
          r2Bucket: "assets-development",
          r2Prefix: "registered/development",
          publicBaseUrl: "https://development.assets.example.test",
        },
        {
          name: "production",
          r2Bucket: "assets-production",
          r2Prefix: "registered/production",
          publicBaseUrl: "https://assets.example.test",
        },
      ],
    }
    const missing = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    )
    expect(missing.status).toBe(401)

    const response = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { cookie: administrator, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    )

    expect(response.status).toBe(201)
    expect(receivedSubject).toBe("human-1")
    expect(receivedInput).toEqual(body)

    const wrongOrganization = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { cookie: administrator, "content-type": "application/json" },
        body: JSON.stringify({ ...body, organization: { ...body.organization, id: "org-2" } }),
      }),
    )
    expect(wrongOrganization.status).toBe(403)

    const invalid = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { cookie: administrator, "content-type": "application/json" },
        body: JSON.stringify({ ...body, environments: [body.environments[0]] }),
      }),
    )
    expect(invalid.status).toBe(400)

    const regularOptions = optionsCreate()
    const regularApp = apiAppCreate(regularOptions)
    const regular = await sessionCreate(regularOptions)
    const forbidden = await regularApp.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { cookie: regular, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    )
    expect(forbidden.status).toBe(403)

    const serviceOptions = optionsCreate()
    const serviceApp = apiAppCreate(serviceOptions)
    const serviceAdministrator = await sessionCreate(serviceOptions, "contributor", true, "service_account")
    const serviceForbidden = await serviceApp.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { cookie: serviceAdministrator, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    )
    expect(serviceForbidden.status).toBe(403)
  })

  test("creates projects for the exact configured machine provisioner via PAT and enforces organization equality", async () => {
    let receivedSubject: string | undefined
    let receivedInput: unknown
    const provisionerSubjectId = "machine-provisioner-1"
    const pat = "eyJhbGciOiJBMjU2R0NNS1ciLCJlbmMiOiJBMjU2R0NNIn0.ciphertext.tag.iv.extra"

    const makeOptions = (
      configuredSubject?: string,
      userSubject = provisionerSubjectId,
      userOrg = "org-1",
      grants: unknown[] = [],
    ) => {
      const options = optionsCreate()
      options.authentication.config = {
        ...options.authentication.config,
        ...(configuredSubject ? { projectProvisionerSubjectId: configuredSubject } : {}),
      }
      options.authentication.serviceBearer = {
        issuer: options.authentication.config.issuer,
        audience: options.authentication.config.audience,
        jwksClient: zitadelJwksClientMemoryCreate([]),
        organizationId: "org-1",
        projectProvisionerSubjectId: configuredSubject,
        now: () => now * 1000,
        patFetcher: async (input) => {
          if (String(input).endsWith("/auth/v1/users/me")) {
            return new Response(
              JSON.stringify({
                user: {
                  id: userSubject,
                  state: "USER_STATE_ACTIVE",
                  details: { resourceOwner: userOrg },
                  machine: { name: "Provisioner" },
                },
              }),
            )
          }
          return new Response(JSON.stringify({ result: grants }))
        },
      }
      const repository = options.projectRepository
      options.projectRepository = {
        ...repository,
        projectCreate: (input, subjectId) => {
          receivedInput = input
          receivedSubject = subjectId
          return {
            success: true,
            data: {
              project: { project, organization: null, binding, environments: [environment] },
              created: true,
            },
          }
        },
      }
      return options
    }

    const body = {
      organization: { id: "org-1", name: "Example", slug: "example" },
      name: "Provisioned",
      slug: "provisioned",
      defaultEnvironment: "development",
      binding: { zitadelProjectId: "zitadel-provisioned", serviceProjectId: "service-provisioned" },
      environments: [
        {
          name: "development",
          r2Bucket: "assets-development",
          r2Prefix: "provisioned/development",
          publicBaseUrl: "https://development.assets.example.test",
        },
        {
          name: "production",
          r2Bucket: "assets-production",
          r2Prefix: "provisioned/production",
          publicBaseUrl: "https://assets.example.test",
        },
      ],
    }

    // 1. Valid machine provisioner PAT succeeds
    const provisionerOptions = makeOptions(provisionerSubjectId)
    const provisionerApp = apiAppCreate(provisionerOptions)
    const successResponse = await provisionerApp.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: `Bearer ${pat}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    )
    expect(successResponse.status).toBe(201)
    expect(receivedSubject).toBe(provisionerSubjectId)
    expect(receivedInput).toEqual(body)

    // 2. Organization mismatch in body is rejected
    const wrongOrgResponse = await provisionerApp.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: `Bearer ${pat}`, "content-type": "application/json" },
        body: JSON.stringify({ ...body, organization: { ...body.organization, id: "org-2" } }),
      }),
    )
    expect(wrongOrgResponse.status).toBe(403)
    const wrongOrgBody = (await wrongOrgResponse.json()) as { error: { message: string } }
    expect(wrongOrgBody.error.message).toBe("The project organization was not allowed")

    // 3. Different machine subject with active project grant is authenticated but forbidden from project creation
    const wrongSubjectOptions = makeOptions(provisionerSubjectId, "other-machine-subject", "org-1", [
      {
        projectId: "zitadel-other",
        orgId: "org-1",
        state: "USER_GRANT_STATE_ACTIVE",
        roleKeys: ["admin"],
      },
    ])
    const wrongSubjectApp = apiAppCreate(wrongSubjectOptions)
    const wrongSubjectResponse = await wrongSubjectApp.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: `Bearer ${pat}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    )
    expect(wrongSubjectResponse.status).toBe(403)
    const wrongSubjectBody = (await wrongSubjectResponse.json()) as { error: { message: string } }
    expect(wrongSubjectBody.error.message).toBe("Organization administrator access is required")

    // 4. Different machine subject without grants is rejected at authentication
    const noGrantsSubjectOptions = makeOptions(provisionerSubjectId, "other-machine-subject", "org-1", [])
    const noGrantsSubjectApp = apiAppCreate(noGrantsSubjectOptions)
    const noGrantsSubjectResponse = await noGrantsSubjectApp.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: `Bearer ${pat}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    )
    expect(noGrantsSubjectResponse.status).toBe(401)

    // 5. Provisioner not configured on server with active grants is forbidden from project creation
    const unconfiguredOptions = makeOptions(undefined, provisionerSubjectId, "org-1", [
      {
        projectId: "zitadel-other",
        orgId: "org-1",
        state: "USER_GRANT_STATE_ACTIVE",
        roleKeys: ["admin"],
      },
    ])
    const unconfiguredApp = apiAppCreate(unconfiguredOptions)
    const unconfiguredResponse = await unconfiguredApp.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: `Bearer ${pat}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    )
    expect(unconfiguredResponse.status).toBe(403)
    const unconfiguredBody = (await unconfiguredResponse.json()) as { error: { message: string } }
    expect(unconfiguredBody.error.message).toBe("Organization administrator access is required")

    // 5. JWT token (even with provisioner subject) is rejected
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const jwtToken = await serviceTokenCreate(keys.privateKey, {
      sub: provisionerSubjectId,
      client_id: "machine-client-1",
    })
    const jwtOptions = makeOptions(provisionerSubjectId)
    jwtOptions.authentication.serviceBearer = {
      issuer: jwtOptions.authentication.config.issuer,
      audience: jwtOptions.authentication.config.audience,
      jwksClient: zitadelJwksClientMemoryCreate([jwk]),
      jwksUri: "https://zitadel.example.test/keys",
      organizationId: "org-1",
      serviceAccountClientId: "machine-client-1",
      projectProvisionerSubjectId: provisionerSubjectId,
      now: () => now * 1000,
    }
    const jwtApp = apiAppCreate(jwtOptions)
    const jwtResponse = await jwtApp.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: `Bearer ${jwtToken}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    )
    expect(jwtResponse.status).toBe(403)
  })

  test("allows machine provisioner to create projects for other configured owner tenants, denying customer and unconfigured tenants and cross-tenant human admins", async () => {
    const provisionerSubjectId = "provisioner-subject-id"
    const multiOwnerMappings = [
      { ownerOrganizationId: "org-1", customerOrganizationId: "org-customers" },
      { ownerOrganizationId: "org-2", customerOrganizationId: "org-2-customers" },
    ] as const

    const options = optionsCreate()
    options.authentication.config = {
      ...options.authentication.config,
      projectProvisionerSubjectId: provisionerSubjectId,
      organizationMappings: multiOwnerMappings,
    }
    options.authentication.serviceBearer = {
      issuer: options.authentication.config.issuer,
      audience: options.authentication.config.audience,
      jwksClient: zitadelJwksClientMemoryCreate([]),
      organizationId: "org-1",
      projectProvisionerSubjectId: provisionerSubjectId,
      allowedOrganizationIds: ["org-1", "org-2"],
      now: () => now * 1000,
      patFetcher: async (input) => {
        if (String(input).endsWith("/auth/v1/users/me")) {
          return new Response(
            JSON.stringify({
              user: {
                id: provisionerSubjectId,
                state: "USER_STATE_ACTIVE",
                details: { resourceOwner: "org-1" },
                machine: { name: "Provisioner" },
              },
            }),
          )
        }
        return new Response(JSON.stringify({ result: [] }))
      },
    }

    let createdCount = 0
    const repository = options.projectRepository
    options.projectRepository = {
      ...repository,
      projectCreate: (input, subjectId) => {
        createdCount++
        return {
          success: true,
          data: {
            project: {
              project: { ...project, id: `proj-${createdCount}` },
              organization: null,
              binding,
              environments: [environment],
            },
            created: true,
          },
        }
      },
    }

    const app = apiAppCreate(options)
    const patHeader = "Bearer pat-token-multi"

    const makeCreateBody = (orgId: string) => ({
      organization: { id: orgId, name: `Name ${orgId}`, slug: `slug-${orgId}` },
      name: "New Project",
      slug: `new-proj-${orgId}`,
      defaultEnvironment: "development",
      binding: { zitadelProjectId: `zit-${orgId}`, serviceProjectId: `srv-${orgId}` },
      environments: [
        {
          name: "development",
          r2Bucket: "assets-dev",
          r2Prefix: `prefix-${orgId}/dev`,
          publicBaseUrl: "https://dev.example.test",
        },
        {
          name: "production",
          r2Bucket: "assets-prod",
          r2Prefix: `prefix-${orgId}/prod`,
          publicBaseUrl: "https://prod.example.test",
        },
      ],
    })

    // 1. Provisioner (org-1) creates project for another configured owner tenant (org-2) -> 201
    const validOtherOwner = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: patHeader, "content-type": "application/json" },
        body: JSON.stringify(makeCreateBody("org-2")),
      }),
    )
    expect(validOtherOwner.status).toBe(201)

    // 2. Provisioner creates project for customer tenant -> 403
    const customerDenial = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: patHeader, "content-type": "application/json" },
        body: JSON.stringify(makeCreateBody("org-customers")),
      }),
    )
    expect(customerDenial.status).toBe(403)
    const customerDenialBody = (await customerDenial.json()) as { error: { message: string } }
    expect(customerDenialBody.error.message).toBe("The project organization was not allowed")

    // 3. Provisioner creates project for unconfigured tenant -> 403
    const unconfiguredDenial = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { authorization: patHeader, "content-type": "application/json" },
        body: JSON.stringify(makeCreateBody("org-unconfigured")),
      }),
    )
    expect(unconfiguredDenial.status).toBe(403)
    const unconfiguredDenialBody = (await unconfiguredDenial.json()) as { error: { message: string } }
    expect(unconfiguredDenialBody.error.message).toBe("The project organization was not allowed")

    // 4. Ordinary owner human admin (org-1) attempting cross-tenant create for org-2 -> 403
    const org1AdminCookie = await sessionCreate(options, "admin", true, "org-1")
    const crossTenantHuman = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { cookie: org1AdminCookie, "content-type": "application/json" },
        body: JSON.stringify(makeCreateBody("org-2")),
      }),
    )
    expect(crossTenantHuman.status).toBe(403)
    const crossTenantHumanBody = (await crossTenantHuman.json()) as { error: { message: string } }
    expect(crossTenantHumanBody.error.message).toBe("The project organization was not allowed")
  })

  test("allows an organization administrator to access an ungranted same-organization project only", async () => {
    const ungrantedProject = { ...project, id: "project-2", name: "Un granted" }
    const ungrantedBinding = {
      ...binding,
      id: "binding-2",
      projectId: ungrantedProject.id,
      zitadelProjectId: "zitadel-2",
      serviceProjectId: "project-service-2",
    }
    const optionsCreateProtected = () => {
      const options = optionsCreate()
      const repository = options.projectRepository
      options.projectRepository = {
        ...repository,
        projectRead: (identifier) =>
          identifier === ungrantedProject.id
            ? { success: true, data: ungrantedProject }
            : repository.projectRead(identifier),
        projectBindingRead: (identifier) =>
          identifier === ungrantedBinding.serviceProjectId
            ? { success: true, data: ungrantedBinding }
            : repository.projectBindingRead(identifier),
      }
      return options
    }

    const administratorOptions = optionsCreateProtected()
    const administratorApp = apiAppCreate(administratorOptions)
    const administratorCookie = await sessionCreate(administratorOptions, "contributor", true)
    const administratorResponse = await administratorApp.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service-2", {
        headers: { cookie: administratorCookie },
      }),
    )
    expect(administratorResponse.status).toBe(200)

    const regularOptions = optionsCreateProtected()
    const regularApp = apiAppCreate(regularOptions)
    const regularCookie = await sessionCreate(regularOptions)
    const regularResponse = await regularApp.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service-2", {
        headers: { cookie: regularCookie },
      }),
    )
    expect(regularResponse.status).toBe(403)

    const keys = await keyPairCreate()
    const serviceToken = await serviceTokenCreate(keys.privateKey)
    const serviceOptions = optionsCreateProtected()
    serviceOptions.authentication.serviceBearer = {
      issuer: authenticationConfig.issuer,
      audience: authenticationConfig.audience,
      jwksUri: "https://zitadel.example.test/keys",
      jwksClient: zitadelJwksClientMemoryCreate([await jwkCreate(keys.publicKey)]),
      organizationId: "org-1",
      serviceAccountClientId: "machine-client-1",
      now: () => now * 1000,
    }
    const serviceApp = apiAppCreate(serviceOptions)
    const serviceResponse = await serviceApp.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service-2", {
        headers: { authorization: `Bearer ${serviceToken}` },
      }),
    )
    expect(serviceResponse.status).toBe(403)
  })

  test("isolates grants by organization and exact Zitadel project", async () => {
    const principals = [
      { organizationId: "org-1", projectId: "zitadel-other" },
      { organizationId: "org-other", projectId: "zitadel-1" },
    ]
    for (const [index, value] of principals.entries()) {
      const options = optionsCreate()
      const app = apiAppCreate(options)
      const session: AuthenticationSession = {
        principal: {
          subjectId: `human-isolation-${index}`,
          organizationId: value.organizationId,
          mode: value.organizationId === authenticationConfig.organizationId ? "admin" : "contributor",
          organizationAdmin: false,
          method: "human_session",
          grants: [{ projectId: value.projectId, roles: ["admin"] }],
          issuedAt: now - 60,
          expiresAt: now + 600,
        },
        createdAt: now - 60,
        expiresAt: now + 600,
        rotateAt: now + 600,
      }
      const created = await options.authentication.sessionStore.create(session)
      expect(created.success).toBe(true)
      if (!created.success) continue
      const cookie = sessionCookieCreate(created.data, {
        name: authenticationConfig.sessionCookieName,
        maxAgeSeconds: 600,
      })
      const response = await app.fetch(
        new Request("https://assets.example.test/api/v1/projects/project-service", { headers: { cookie } }),
      )
      expect(response.status).toBe(403)
    }
  })

  test("parses auth requests and returns session and logout responses", async () => {
    const options = optionsCreate()
    const app = apiAppCreate(options)
    const login = await app.fetch(
      new Request("https://assets.example.test/api/v1/auth/login?returnTo=%2Fprojects", {
        headers: { accept: "application/json" },
      }),
    )
    const invalidLogin = await app.fetch(
      new Request("https://assets.example.test/api/v1/auth/login?returnTo=https%3A%2F%2Fevil.test"),
    )
    const cookie = await sessionCreate(options)
    const session = await app.fetch(
      new Request("https://assets.example.test/api/v1/auth/session", { headers: { cookie } }),
    )
    const logout = await app.fetch(
      new Request("https://assets.example.test/api/v1/auth/logout", { method: "POST", headers: { cookie } }),
    )

    expect(login.status).toBe(200)
    expect(login.headers.get("set-cookie")).toContain("assets_state=")
    expect(await login.json()).toMatchObject({
      ok: true,
      data: { authorizationUrl: "https://zitadel.example.test/authorize?state=one" },
    })
    expect(invalidLogin.status).toBe(400)
    expect(await invalidLogin.json()).toMatchObject({ ok: false, error: { code: "validation_failed" } })
    expect(session.status).toBe(200)
    expect(await session.json()).toMatchObject({
      ok: true,
      data: { authenticated: true, principal: { mode: "admin" } },
    })
    expect(logout.status).toBe(200)
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0")
  })
})
