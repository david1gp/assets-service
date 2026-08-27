import { describe, expect, test } from "bun:test"

import { apiAppCreate } from "../src/api/apiAppCreate.js"
import type { ApiAppOptions } from "../src/api/apiAppOptions.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { sessionCookieCreate } from "../src/authentication/sessionCookieCreate.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"
import type { ZitadelJwk } from "../src/infrastructure/zitadel/zitadelJwk.js"
import { zitadelJwksClientMemoryCreate } from "../src/infrastructure/zitadel/zitadelJwksClientMemoryCreate.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"

const now = 1_700_000_000

const base64UrlEncode = (value: Uint8Array | string): string =>
  Buffer.from(typeof value === "string" ? value : value).toString("base64url")

const keyPairCreate = async () =>
  crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )

const serviceTokenCreate = async (privateKey: CryptoKey): Promise<string> => {
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
      assets_project_grants: { "zitadel-1": ["assets.uploader"] },
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
    organizationMembershipRead: async () => ({ success: true as const, data: false }),
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
  role: "assets.uploader" | "assets.admin" = "assets.uploader",
  organizationAdmin = false,
) => {
  const session: AuthenticationSession = {
    principal: {
      subjectId: "human-1",
      organizationId: "org-1",
      organizationAdmin,
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
    const cookie = await sessionCreate(options, "assets.admin")
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
    const options = optionsCreate()
    options.projectRepository = {
      ...options.projectRepository,
      projectsRead: (_organizationId, _zitadelProjectIds, organizationAdmin) => {
        requestedOrganizationAdmin = organizationAdmin
        return { success: true, data: [project] }
      },
    }
    const app = apiAppCreate(options)
    const administrator = await sessionCreate(options, "assets.uploader", true)
    const administratorResponse = await app.fetch(
      new Request("https://assets.example.test/api/v1/projects", { headers: { cookie: administrator } }),
    )
    expect(administratorResponse.status).toBe(200)
    expect(requestedOrganizationAdmin).toBe(true)

    const regularOptions = optionsCreate()
    regularOptions.projectRepository = {
      ...regularOptions.projectRepository,
      projectsRead: (_organizationId, _zitadelProjectIds, organizationAdmin) => {
        requestedOrganizationAdmin = organizationAdmin
        return { success: true, data: [project] }
      },
    }
    const regularApp = apiAppCreate(regularOptions)
    const regular = await sessionCreate(regularOptions)
    const regularResponse = await regularApp.fetch(
      new Request("https://assets.example.test/api/v1/projects", { headers: { cookie: regular } }),
    )
    expect(regularResponse.status).toBe(200)
    expect(requestedOrganizationAdmin).toBe(false)
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
    const administratorCookie = await sessionCreate(administratorOptions, "assets.uploader", true)
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
          organizationAdmin: false,
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
    expect(login.headers.get("set-cookie")).toContain("assets_state=")
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
