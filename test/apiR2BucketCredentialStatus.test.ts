import { expect, test } from "bun:test"

import { apiAppCreate } from "../src/api/apiAppCreate.js"
import type { ApiAppOptions } from "../src/api/apiAppOptions.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { sessionCookieCreate } from "../src/authentication/sessionCookieCreate.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"
import type { R2BucketCredential } from "../src/r2/r2BucketCredentialSchema.js"
import type { R2BucketCredentialRepository } from "../src/r2/r2BucketCredentialRepository.js"

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

const projectRepositoryCreate = (): ProjectRepository => ({
  projectsRead: () => ({ success: true, data: [] }),
  projectRead: (identifier) => ({
    success: true,
    data: identifier === "project-service" || identifier === "project-1" ? project : null,
  }),
  projectBindingRead: (identifier) => ({
    success: true,
    data: identifier === "project-service" ? binding : null,
  }),
  environmentsRead: () => ({ success: true, data: [environment] }),
  environmentRead: (projectId) => ({ success: true, data: projectId === project.id ? environment : null }),
  projectSettingsRead: () => ({ success: true, data: null }),
  projectSettingsWrite: () => ({ success: true, data: null }),
  projectCreate: () => ({ success: false, op: "test", errorMessage: "not used" }),
  organizationRead: () => ({ success: true, data: null }),
  organizationReadBySlug: () => ({ success: true, data: null }),
  projectReadByOrganizationIdAndSlug: () => ({ success: true, data: null }),
})

const credentialCreate = (): R2BucketCredential => ({
  bucket: "assets-development",
  accessKeyId: "access-key-secret",
  secretAccessKey: "secret-access-key-secret",
  revocationId: "revocation-secret",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
})

const credentialRepositoryCreate = (
  registered: boolean,
): Pick<R2BucketCredentialRepository, "r2BucketCredentialRead"> => ({
  r2BucketCredentialRead: (bucket) => ({
    success: true,
    data: registered && bucket === environment.r2Bucket ? credentialCreate() : null,
  }),
})

const optionsCreate = (requiredRole: "admin" | "contributor", registered: boolean): ApiAppOptions => {
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
      sessionStore: memorySessionStoreCreate({ sessionIdCreate: () => `${requiredRole}-session` }),
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
    projectRepository: projectRepositoryCreate(),
    r2BucketCredentialRepository: credentialRepositoryCreate(registered),
    requestIdCreate: () => "r2-status-request",
  }
}

const sessionCreate = async (options: ApiAppOptions, role: "admin" | "contributor") => {
  const session: AuthenticationSession = {
    principal: {
      subjectId: `${role}-actor`,
      organizationId: "org-1",
      mode: role,
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

const requestCreate = (path: string, cookie: string) =>
  new Request(`https://assets.example.test${path}`, {
    headers: { cookie, accept: "application/json" },
  })

const statusPath = "/api/v1/projects/project-service/environments/development/r2-credential/status"

test("R2 credential status is admin-only, binding-scoped, and secret-free", async () => {
  const absentOptions = optionsCreate("admin", false)
  const unauthenticatedResponse = await apiAppCreate(absentOptions).fetch(requestCreate(statusPath, ""))
  expect(unauthenticatedResponse.status).toBe(401)

  const absentAdmin = await sessionCreate(absentOptions, "admin")
  const absentResponse = await apiAppCreate(absentOptions).fetch(requestCreate(statusPath, absentAdmin))
  expect(absentResponse.status).toBe(200)
  expect(await absentResponse.json()).toMatchObject({
    data: {
      projectId: "project-1",
      environment: "development",
      bucket: "assets-development",
      registered: false,
    },
  })

  const presentOptions = optionsCreate("admin", true)
  const presentAdmin = await sessionCreate(presentOptions, "admin")
  const presentResponse = await apiAppCreate(presentOptions).fetch(requestCreate(statusPath, presentAdmin))
  const presentJson = await presentResponse.json()
  expect(presentResponse.status).toBe(200)
  expect(presentJson).toEqual({
    ok: true,
    data: {
      projectId: "project-1",
      environment: "development",
      bucket: "assets-development",
      registered: true,
    },
    requestId: "r2-status-request",
  })
  expect(JSON.stringify(presentJson)).not.toContain("access-key-secret")
  expect(JSON.stringify(presentJson)).not.toContain("secret-access-key-secret")
  expect(JSON.stringify(presentJson)).not.toContain("revocation-secret")

  const contributorOptions = optionsCreate("contributor", true)
  const contributor = await sessionCreate(contributorOptions, "contributor")
  const contributorResponse = await apiAppCreate(contributorOptions).fetch(requestCreate(statusPath, contributor))
  expect(contributorResponse.status).toBe(403)

  const crossProjectResponse = await apiAppCreate(presentOptions).fetch(
    requestCreate("/api/v1/projects/other-project/environments/development/r2-credential/status", presentAdmin),
  )
  expect(crossProjectResponse.status).toBe(404)
})
