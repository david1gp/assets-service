import { describe, expect, test } from "bun:test"

import { apiAppCreate } from "../src/api/apiAppCreate.js"
import type { ApiAppOptions } from "../src/api/apiAppOptions.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { sessionCookieCreate } from "../src/authentication/sessionCookieCreate.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"

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
  projectId: "zitadel-1",
  sessionCookieName: "assets_session",
  stateCookieName: "assets_state",
  sessionTtlSeconds: 3600,
  sessionRotationSeconds: 60,
  clockSkewSeconds: 0,
  jwksCacheTtlSeconds: 60,
}

const projectRepositoryCreate = (): ProjectRepository => ({
  projectsRead: () => ({ success: true, data: [project] }),
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

const sessionCreate = async (options: ApiAppOptions, role: "assets.uploader" | "assets.admin" = "assets.uploader") => {
  const session: AuthenticationSession = {
    principal: {
      subjectId: "human-1",
      organizationId: "org-1",
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
    const adminCookie = await sessionCreate(adminOptions, "assets.admin")
    const adminSettings = await adminApp.fetch(
      new Request("https://assets.example.test/api/v1/projects/project-service/settings", {
        headers: { cookie: adminCookie },
      }),
    )
    expect(adminSettings.status).toBe(200)
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
          method: "human_session",
          grants: [{ projectId: value.projectId, roles: ["assets.admin"] }],
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
    expect(await login.json()).toMatchObject({
      ok: true,
      data: { authorizationUrl: "https://zitadel.example.test/authorize?state=one" },
    })
    expect(invalidLogin.status).toBe(400)
    expect(await invalidLogin.json()).toMatchObject({ ok: false, error: { code: "validation_failed" } })
    expect(session.status).toBe(200)
    expect(await session.json()).toMatchObject({ ok: true, data: { authenticated: true } })
    expect(logout.status).toBe(200)
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0")
  })
})
