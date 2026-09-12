import { expect, test } from "bun:test"

import { apiAppCreate } from "../src/api/apiAppCreate.js"
import type { ApiAppOptions } from "../src/api/apiAppOptions.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { sessionCookieCreate } from "../src/authentication/sessionCookieCreate.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"
import type { R2BucketCredentialRepairResult } from "../src/r2/r2BucketCredentialRepairResultSchema.js"

const now = 1_700_000_000
const requestId = "r2-repair-request"
const repairInput = { accountId: "account-secret", apiToken: "api-token-secret" }
const repairResult: R2BucketCredentialRepairResult = {
  discoveredBuckets: ["assets-production"],
  repairedBuckets: ["assets-production"],
  skippedBuckets: [],
  verifiedBuckets: ["assets-production"],
  revokedBuckets: ["assets-production"],
}

const projectRepositoryCreate = (): ProjectRepository => ({
  projectsRead: () => ({ success: true, data: [] }),
  projectRead: () => ({ success: true, data: null }),
  projectBindingRead: () => ({ success: true, data: null }),
  environmentsRead: () => ({ success: true, data: [] }),
  environmentRead: () => ({ success: true, data: null }),
  projectSettingsRead: () => ({ success: true, data: null }),
  projectSettingsWrite: () => ({ success: true, data: null }),
  projectCreate: () => ({ success: false, op: "test", errorMessage: "not used" }),
  organizationRead: () => ({ success: true, data: null }),
  organizationReadBySlug: () => ({ success: true, data: null }),
  projectReadByOrganizationIdAndSlug: () => ({ success: true, data: null }),
})

const optionsCreate = (
  repair: ApiAppOptions["r2BucketCredentialRepair"] | null = {
    r2BucketCredentialRepair: async () => ({ success: true, data: repairResult }),
  },
): ApiAppOptions => {
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
      sessionStore: memorySessionStoreCreate({ sessionIdCreate: () => "r2-repair-session" }),
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
    ...(repair === null ? {} : { r2BucketCredentialRepair: repair }),
    requestIdCreate: () => requestId,
  }
}

const sessionCookieRead = async (options: ApiAppOptions, organizationAdmin: boolean): Promise<string> => {
  const session: AuthenticationSession = {
    principal: {
      subjectId: "human-actor",
      organizationId: "org-1",
      mode: "admin",
      organizationAdmin,
      method: "human_session",
      grants: [],
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

const requestCreate = (cookie: string, body = JSON.stringify(repairInput)): Request =>
  new Request("https://assets.example.test/api/v1/operations/r2-bucket-credentials/repair", {
    method: "POST",
    headers: { cookie, accept: "application/json", "content-type": "application/json" },
    body,
  })

test("R2 credential repair denies non-administrator human sessions without invoking the dependency", async () => {
  let repairCalls = 0
  const options = optionsCreate({
    r2BucketCredentialRepair: async () => {
      repairCalls += 1
      return { success: true, data: repairResult }
    },
  })
  const cookie = await sessionCookieRead(options, false)
  const response = await apiAppCreate(options).fetch(requestCreate(cookie))
  const json = await response.json()

  expect(response.status).toBe(403)
  expect(json).toMatchObject({ ok: false, error: { code: "forbidden" } })
  expect(repairCalls).toBe(0)
  expect(JSON.stringify(json)).not.toContain(repairInput.apiToken)
  expect(JSON.stringify(json)).not.toContain("assets-production")
})

test("R2 credential repair permits human organization administrators and returns only its safe result contract", async () => {
  let receivedInput: unknown
  const options = optionsCreate({
    r2BucketCredentialRepair: async (input) => {
      receivedInput = input
      return { success: true, data: repairResult }
    },
  })
  const cookie = await sessionCookieRead(options, true)
  const response = await apiAppCreate(options).fetch(requestCreate(cookie))
  const json = await response.json()

  expect(response.status).toBe(200)
  expect(json).toEqual({ ok: true, data: repairResult, requestId })
  expect(receivedInput).toEqual(repairInput)
  expect(JSON.stringify(json)).not.toContain(repairInput.accountId)
  expect(JSON.stringify(json)).not.toContain(repairInput.apiToken)
  expect(JSON.stringify(json)).not.toContain("unlisted-sensitive-bucket")
})

test("R2 credential repair reports a missing dependency without reading the request body", async () => {
  const options = optionsCreate(null)
  const cookie = await sessionCookieRead(options, true)
  const response = await apiAppCreate(options).fetch(requestCreate(cookie, "not-json"))
  const json = await response.json()

  expect(response.status).toBe(500)
  expect(json).toEqual({
    ok: false,
    error: {
      code: "not_configured",
      message: "The requested API operation is not configured",
      retryable: true,
    },
    requestId,
  })
  expect(JSON.stringify(json)).not.toContain(repairInput.accountId)
  expect(JSON.stringify(json)).not.toContain(repairInput.apiToken)
  expect(JSON.stringify(json)).not.toContain("assets-production")
})
