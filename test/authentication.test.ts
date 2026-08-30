import { describe, expect, test } from "bun:test"
import { rm } from "node:fs/promises"

import { databaseSessionStoreCreate } from "../src/authentication/databaseSessionStoreCreate.js"
import { humanLoginCallback } from "../src/authentication/humanLoginCallback.js"
import { humanLoginInitiate } from "../src/authentication/humanLoginInitiate.js"
import { jwtPrincipalValidate } from "../src/authentication/jwtPrincipalValidate.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { projectAuthorizationCheck } from "../src/authentication/projectAuthorizationCheck.js"
import { protectedRequestBoundaryCreate } from "../src/authentication/protectedRequestBoundaryCreate.js"
import { requestAuthenticationRead } from "../src/authentication/requestAuthenticationRead.js"
import { serviceBearerValidate } from "../src/authentication/serviceBearerValidate.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { zitadelCredentialDoctor } from "../src/infrastructure/zitadel/zitadelCredentialDoctor.js"
import { zitadelGrantAdapterMemoryCreate } from "../src/infrastructure/zitadel/zitadelGrantAdapterMemoryCreate.js"
import type { ZitadelJwk } from "../src/infrastructure/zitadel/zitadelJwk.js"
import { zitadelJwksClientCreate } from "../src/infrastructure/zitadel/zitadelJwksClientCreate.js"
import { zitadelJwksClientMemoryCreate } from "../src/infrastructure/zitadel/zitadelJwksClientMemoryCreate.js"
import { zitadelOidcClientCreate } from "../src/infrastructure/zitadel/zitadelOidcClientCreate.js"
import { zitadelProvisioningAdapterMemoryCreate } from "../src/infrastructure/zitadel/zitadelProvisioningAdapterMemoryCreate.js"

const nowSeconds = 1_700_000_000

const base64UrlEncode = (value: Uint8Array | string): string =>
  Buffer.from(typeof value === "string" ? value : value).toString("base64url")

const keyPairCreate = async () =>
  crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )

const tokenCreate = async (privateKey: CryptoKey, claims: Record<string, unknown>): Promise<string> => {
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", kid: "key-1", typ: "JWT" }))
  const payload = base64UrlEncode(JSON.stringify(claims))
  const signingInput = `${header}.${payload}`
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(signingInput))
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`
}

const tokenClaimsCreate = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  iss: "https://zitadel.example.test",
  aud: ["assets-api"],
  sub: "service-account-1",
  iat: nowSeconds - 60,
  exp: nowSeconds + 600,
  "urn:zitadel:iam:org:id": "org-1",
  client_id: "machine-client-1",
  assets_project_grants: { "zitadel-project-1": ["assets.uploader"] },
  ...overrides,
})

const jwkCreate = async (publicKey: CryptoKey): Promise<ZitadelJwk> => {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey)
  return { ...(jwk as unknown as ZitadelJwk), kid: "key-1", alg: "RS256", use: "sig" }
}

const configCreate = () => ({
  issuer: "https://zitadel.example.test",
  clientId: "human-client-1",
  redirectUri: "https://assets.example.test/auth/callback",
  audience: "assets-api",
  organizationId: "org-1",
  projectId: "zitadel-project-1",
  sessionCookieName: "assets_session",
  stateCookieName: "assets_state",
  sessionTtlSeconds: 3600,
  sessionRotationSeconds: 60,
  clockSkewSeconds: 0,
  jwksCacheTtlSeconds: 60,
})

describe("Zitadel authentication contracts", () => {
  test("validates a signed service bearer and rejects issuer, audience, expiry, and signature failures", async () => {
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const jwksClient = zitadelJwksClientMemoryCreate([jwk])
    const token = await tokenCreate(keys.privateKey, tokenClaimsCreate())
    const options = {
      issuer: "https://zitadel.example.test",
      audience: "assets-api",
      jwksUri: "https://zitadel.example.test/oauth/v2/keys",
      jwksClient,
      organizationId: "org-1",
      serviceAccountClientId: "machine-client-1",
      now: () => nowSeconds * 1000,
    }

    const valid = await serviceBearerValidate(
      new Request("https://assets.example.test", { headers: { authorization: `Bearer ${token}` } }),
      options,
    )
    expect(valid).toMatchObject({
      success: true,
      data: { method: "service_account", organizationAdmin: false, grants: [{ projectId: "zitadel-project-1" }] },
    })
    if (valid.success) expect(valid.data).not.toHaveProperty("displayName")

    const withoutGrantToken = await tokenCreate(
      keys.privateKey,
      tokenClaimsCreate({ assets_project_grants: {}, project_id: undefined, projectId: undefined }),
    )
    const withoutGrant = await serviceBearerValidate(
      new Request("https://assets.example.test", { headers: { authorization: `Bearer ${withoutGrantToken}` } }),
      options,
    )
    expect(withoutGrant.success).toBe(false)

    const wrongIssuer = await jwtPrincipalValidate(token, {
      ...options,
      method: "service_account",
      issuer: "https://wrong.example.test",
    })
    expect(wrongIssuer.success).toBe(false)
    const wrongAudience = await jwtPrincipalValidate(token, {
      ...options,
      method: "service_account",
      audience: "other-api",
    })
    expect(wrongAudience.success).toBe(false)
    const expired = await jwtPrincipalValidate(token, {
      ...options,
      method: "service_account",
      now: () => (nowSeconds + 700) * 1000,
    })
    expect(expired.success).toBe(false)
    const invalidSignature = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`
    const signatureFailure = await serviceBearerValidate(
      new Request("https://assets.example.test", { headers: { authorization: `Bearer ${invalidSignature}` } }),
      options,
    )
    expect(signatureFailure.success).toBe(false)

    const standardRoleToken = await tokenCreate(
      keys.privateKey,
      tokenClaimsCreate({
        assets_project_grants: undefined,
        project_id: "zitadel-project-1",
        "urn:zitadel:iam:org:project:roles": { "assets.admin": { "org-1": "" } },
      }),
    )
    const standardRole = await serviceBearerValidate(
      new Request("https://assets.example.test", { headers: { authorization: `Bearer ${standardRoleToken}` } }),
      options,
    )
    expect(standardRole).toMatchObject({ success: true, data: { grants: [{ roles: ["admin"] }] } })
  })

  test("validates a Zitadel personal access token through the user and grant endpoints", async () => {
    const pat = "eyJhbGciOiJBMjU2R0NNS1ciLCJlbmMiOiJBMjU2R0NNIn0.ciphertext.tag.iv.extra"
    const requested: string[] = []
    const result = await serviceBearerValidate(
      new Request("https://assets.example.test", { headers: { authorization: `Bearer ${pat}` } }),
      {
        issuer: "https://zitadel.example.test",
        audience: "assets-api",
        jwksUri: "https://zitadel.example.test/oauth/v2/keys",
        jwksClient: zitadelJwksClientMemoryCreate([]),
        organizationId: "org-1",
        serviceAccountClientId: "machine-client-1",
        projectId: "zitadel-project-1",
        now: () => nowSeconds * 1000,
        patFetcher: async (input) => {
          requested.push(String(input))
          if (String(input).endsWith("/auth/v1/users/me")) {
            return new Response(
              JSON.stringify({
                user: {
                  id: "machine-user-1",
                  state: "USER_STATE_ACTIVE",
                  details: { resourceOwner: "org-1" },
                  machine: { name: "Assets Service CLI" },
                },
              }),
            )
          }
          return new Response(
            JSON.stringify({
              result: [
                {
                  projectId: "zitadel-project-1",
                  orgId: "org-1",
                  state: "USER_GRANT_STATE_ACTIVE",
                  roleKeys: ["assets.admin"],
                },
              ],
            }),
          )
        },
      },
    )
    expect(result).toMatchObject({
      success: true,
      data: {
        method: "service_account",
        subjectId: "machine-user-1",
        organizationAdmin: false,
        grants: [{ projectId: "zitadel-project-1", roles: ["admin"] }],
      },
    })
    if (result.success) expect(result.data).not.toHaveProperty("displayName")
    expect(requested).toEqual([
      "https://zitadel.example.test/auth/v1/users/me",
      "https://zitadel.example.test/auth/v1/usergrants/me/_search",
    ])
  })

  test("reads the exact organization-scoped membership roles from Zitadel", async () => {
    const requested: Array<{ url: string; authorization: string; body: unknown }> = []
    const config = configCreate()
    const membershipRead = async (membership: unknown) => {
      const client = zitadelOidcClientCreate({
        config,
        fetcher: async (input, init) => {
          requested.push({
            url: String(input),
            authorization: String(new Headers(init?.headers).get("authorization")),
            body: JSON.parse(String(init?.body)),
          })
          return new Response(JSON.stringify({ result: [membership] }))
        },
      })
      return client.organizationMembershipRead("human-access-token", "org-1")
    }

    for (const role of ["ORG_OWNER", "ORG_OWNER_VIEWER", "ORG_PROJECT_MANAGER", "ORG_PROJECT_MANAGER_VIEWER"]) {
      expect(await membershipRead({ orgId: "org-1", roles: [role] })).toEqual({ success: true, data: true })
    }
    expect(requested).toHaveLength(4)
    expect(requested[0]).toEqual({
      url: "https://zitadel.example.test/auth/v1/memberships/me/_search",
      authorization: "Bearer human-access-token",
      body: { queries: [{ orgQuery: { orgId: "org-1" } }] },
    })

    expect(await membershipRead({ iam: true, roles: ["ORG_OWNER"] })).toEqual({ success: true, data: false })
    expect(await membershipRead({ projectId: "project-1", roles: ["ORG_OWNER"] })).toEqual({
      success: true,
      data: false,
    })
    expect(await membershipRead({ projectGrantId: "grant-1", roles: ["ORG_OWNER"] })).toEqual({
      success: true,
      data: false,
    })
    expect(await membershipRead({ orgId: "org-1", roles: ["ORG_PROJECT_CREATOR"] })).toEqual({
      success: true,
      data: false,
    })
    expect(await membershipRead({ orgId: "org-2", roles: ["ORG_OWNER"] })).toEqual({ success: true, data: false })
    expect((await membershipRead({ result: "not-a-membership" })).success).toBe(false)

    const failedClient = zitadelOidcClientCreate({
      config,
      fetcher: async () => {
        throw new Error("membership endpoint unavailable")
      },
    })
    const failure = await failedClient.organizationMembershipRead("human-access-token", "org-1")
    expect(failure.success).toBe(false)

    const emptyResponseClient = zitadelOidcClientCreate({
      config,
      fetcher: async () => new Response(JSON.stringify({ result: [] })),
    })
    const emptyResponse = await emptyResponseClient.organizationMembershipRead("human-access-token", "org-1")
    expect(emptyResponse).toEqual({ success: true, data: false })

    const nonOkClient = zitadelOidcClientCreate({
      config,
      fetcher: async () => new Response("unavailable", { status: 503 }),
    })
    const nonOk = await nonOkClient.organizationMembershipRead("human-access-token", "org-1")
    expect(nonOk.success).toBe(false)

    const malformedJsonClient = zitadelOidcClientCreate({
      config,
      fetcher: async () => new Response("{"),
    })
    const malformedJson = await malformedJsonClient.organizationMembershipRead("human-access-token", "org-1")
    expect(malformedJson.success).toBe(false)

    const malformedEnvelopeClient = zitadelOidcClientCreate({
      config,
      fetcher: async () => new Response(JSON.stringify({})),
    })
    const malformedEnvelope = await malformedEnvelopeClient.organizationMembershipRead("human-access-token", "org-1")
    expect(malformedEnvelope.success).toBe(false)

    const malformedMembershipClient = zitadelOidcClientCreate({
      config,
      fetcher: async () =>
        new Response(JSON.stringify({ result: [{ orgId: "org-1", roles: ["ORG_OWNER"], iam: true }] })),
    })
    const malformedMembership = await malformedMembershipClient.organizationMembershipRead(
      "human-access-token",
      "org-1",
    )
    expect(malformedMembership.success).toBe(false)
  })

  test("caches JWKS responses and refreshes a rotated key on demand", async () => {
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    let calls = 0
    const client = zitadelJwksClientCreate({
      ttlSeconds: 60,
      now: () => nowSeconds * 1000,
      fetcher: async () => {
        calls += 1
        return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } })
      },
    })
    await client.keysRead("https://zitadel.example.test/oauth/v2/keys")
    await client.keysRead("https://zitadel.example.test/oauth/v2/keys")
    await client.keysRead("https://zitadel.example.test/oauth/v2/keys", true)
    expect(calls).toBe(2)
  })

  test("does not turn unqualified roles into a project grant", async () => {
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const token = await tokenCreate(
      keys.privateKey,
      tokenClaimsCreate({ assets_project_grants: undefined, roles: ["assets.admin"] }),
    )
    const result = await serviceBearerValidate(
      new Request("https://assets.example.test", { headers: { authorization: `Bearer ${token}` } }),
      {
        issuer: "https://zitadel.example.test",
        audience: "assets-api",
        jwksUri: "https://zitadel.example.test/oauth/v2/keys",
        jwksClient: zitadelJwksClientMemoryCreate([jwk]),
        organizationId: "org-1",
        serviceAccountClientId: "machine-client-1",
        defaultProjectId: "zitadel-project-1",
        now: () => nowSeconds * 1000,
      },
    )
    expect(result.success).toBe(false)
  })

  test("keeps project roles and service-project bindings exact at the protected boundary", async () => {
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const token = await tokenCreate(keys.privateKey, tokenClaimsCreate())
    const principal = await serviceBearerValidate(
      new Request("https://assets.example.test", { headers: { authorization: `Bearer ${token}` } }),
      {
        issuer: "https://zitadel.example.test",
        audience: "assets-api",
        jwksUri: "https://zitadel.example.test/oauth/v2/keys",
        jwksClient: zitadelJwksClientMemoryCreate([jwk]),
        organizationId: "org-1",
        serviceAccountClientId: "machine-client-1",
        now: () => nowSeconds * 1000,
      },
    )
    expect(principal.success).toBe(true)
    if (!principal.success) return
    const binding = {
      id: "binding-1",
      projectId: "service-project-1",
      organizationId: "org-1",
      zitadelProjectId: "zitadel-project-1",
      serviceProjectId: "service-project-1",
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    }
    expect(projectAuthorizationCheck(principal.data, binding, "contributor", "service-project-1").success).toBe(true)
    expect(projectAuthorizationCheck(principal.data, binding, "admin", "service-project-1").success).toBe(false)
    expect(projectAuthorizationCheck(principal.data, binding, "contributor", "other-service-project").success).toBe(
      false,
    )

    const boundary = protectedRequestBoundaryCreate({
      authenticationRead: async () => ({ success: true as const, data: { principal: principal.data } }),
      authorizationCheck: async () =>
        projectAuthorizationCheck(principal.data, binding, "contributor", "service-project-1"),
    })
    const response = await boundary(
      new Request("https://assets.example.test/projects/service-project-1"),
      async (_request, actor) => Response.json({ subjectId: actor.subjectId }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ subjectId: "service-account-1" })
  })

  test("initiates PKCE, creates a secure session, and rotates the opaque cookie", async () => {
    let now = nowSeconds
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const token = await tokenCreate(keys.privateKey, tokenClaimsCreate({ sub: "human-1" }))
    const config = configCreate()
    const stateStore = memoryPkceStateStoreCreate({ now: () => now * 1000 })
    const sessionStore = memorySessionStoreCreate({
      sessionIdCreate: (() => {
        let count = 0
        return () => `session-${++count}`
      })(),
    })
    let idToken: string | undefined
    let membershipFailure = false
    const oidcClient = {
      discoveryRead: async () => ({
        success: true as const,
        data: {
          issuer: config.issuer,
          authorization_endpoint: "https://zitadel.example.test/oauth/authorize",
          token_endpoint: "https://zitadel.example.test/oauth/token",
          jwks_uri: "https://zitadel.example.test/oauth/keys",
        },
      }),
      authorizationUrlCreate: async (input: { state: string; codeChallenge: string; nonce: string }) => {
        idToken = await tokenCreate(
          keys.privateKey,
          tokenClaimsCreate({
            aud: config.clientId,
            name: "  Ada Lovelace  ",
            nonce: input.nonce,
            sub: "human-1",
          }),
        )
        return {
          success: true as const,
          data: `https://zitadel.example.test/oauth/authorize?state=${input.state}&code_challenge=${input.codeChallenge}`,
        }
      },
      authorizationCodeExchange: async () => ({
        success: true as const,
        data: { access_token: token, token_type: "Bearer", expires_in: 600, id_token: idToken },
      }),
      organizationMembershipRead: async () =>
        membershipFailure
          ? { success: false as const, op: "testMembershipFailure", errorMessage: "membership lookup failed" }
          : { success: true as const, data: true },
    }
    const deepLink = "/projects/service-project-1/assets/asset-hero?dialog=outputs&cursor=40"
    const initiation = await humanLoginInitiate(
      { returnTo: deepLink },
      {
        config,
        stateStore,
        oidcClient,
        now: () => now * 1000,
        randomBytes: (size) => new Uint8Array(size).fill(7),
      },
    )
    expect(initiation.success).toBe(true)
    if (!initiation.success) return
    expect(initiation.data.stateCookie).toContain("HttpOnly")
    expect(initiation.data.stateCookie).toContain("Secure")
    expect(initiation.data.stateCookie).toContain("SameSite=Lax")

    const callback = await humanLoginCallback(
      { code: "one-time-code", state: initiation.data.state },
      initiation.data.state,
      {
        config,
        stateStore,
        sessionStore,
        oidcClient,
        jwksClient: zitadelJwksClientMemoryCreate([jwk]),
        jwksUri: "https://zitadel.example.test/oauth/keys",
        now: () => now * 1000,
      },
    )
    expect(callback.success).toBe(true)
    if (!callback.success) return
    expect(callback.data.sessionCookie).toContain("HttpOnly")
    expect(callback.data.sessionCookie).toContain("Secure")
    expect(callback.data.stateCookieClear).toContain("Max-Age=0")
    // The whole deep link, path and query, survives the round trip.
    expect(callback.data.returnTo).toBe(deepLink)
    expect(callback.data.principal.organizationAdmin).toBe(true)
    expect(callback.data.principal.displayName).toBe("Ada Lovelace")

    now += 61
    const sessionCookie = callback.data.sessionCookie.split(";", 1)[0]
    if (!sessionCookie) return
    const auth = await requestAuthenticationRead(
      new Request("https://assets.example.test", { headers: { cookie: sessionCookie } }),
      {
        sessionStore,
        sessionCookieName: config.sessionCookieName,
        sessionRotationSeconds: config.sessionRotationSeconds,
        serviceBearer: {
          issuer: config.issuer,
          audience: config.audience,
          jwksUri: "https://zitadel.example.test/oauth/keys",
          jwksClient: zitadelJwksClientMemoryCreate([jwk]),
          organizationId: config.organizationId,
          serviceAccountClientId: "machine-client-1",
        },
        now: () => now * 1000,
      },
    )
    expect(auth.success).toBe(true)
    if (!auth.success) return
    expect(auth.data.sessionCookie).toContain("Secure")
    expect(auth.data.principal.displayName).toBe("Ada Lovelace")

    const oldSessionCookie = callback.data.sessionCookie.split(";", 1)[0]
    if (!oldSessionCookie) return
    const oldSession = await requestAuthenticationRead(
      new Request("https://assets.example.test", { headers: { cookie: oldSessionCookie } }),
      {
        sessionStore,
        sessionCookieName: config.sessionCookieName,
        sessionRotationSeconds: config.sessionRotationSeconds,
        serviceBearer: {
          issuer: config.issuer,
          audience: config.audience,
          jwksUri: "https://zitadel.example.test/oauth/keys",
          jwksClient: zitadelJwksClientMemoryCreate([jwk]),
          organizationId: config.organizationId,
          serviceAccountClientId: "machine-client-1",
        },
        now: () => now * 1000,
      },
    )
    expect(oldSession.success).toBe(false)

    membershipFailure = true
    const failedInitiation = await humanLoginInitiate(
      { returnTo: "/projects" },
      {
        config,
        stateStore,
        oidcClient,
        now: () => now * 1000,
        randomBytes: (size) => new Uint8Array(size).fill(7),
      },
    )
    expect(failedInitiation.success).toBe(true)
    if (!failedInitiation.success) return
    const failedCallback = await humanLoginCallback(
      { code: "one-time-code", state: failedInitiation.data.state },
      failedInitiation.data.state,
      {
        config,
        stateStore,
        sessionStore,
        oidcClient,
        jwksClient: zitadelJwksClientMemoryCreate([jwk]),
        jwksUri: "https://zitadel.example.test/oauth/keys",
        now: () => now * 1000,
      },
    )
    expect(failedCallback).toMatchObject({ success: true, data: { principal: { organizationAdmin: false } } })
  })

  test("establishes claimless organization administrators only after validated membership lookup", async () => {
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const config = configCreate()
    const administratorRoles = new Set([
      "ORG_OWNER",
      "ORG_OWNER_VIEWER",
      "ORG_PROJECT_MANAGER",
      "ORG_PROJECT_MANAGER_VIEWER",
    ])

    const callbackRun = async (
      claims: Record<string, unknown>,
      membershipRoles: readonly string[],
      membershipOrganizationId = config.organizationId,
      tokenTransform: (token: string) => string = (token) => token,
      membershipFailure = false,
      idTokenClaims?: Record<string, unknown>,
      callbackConfig = config,
    ) => {
      const token = tokenTransform(
        await tokenCreate(keys.privateKey, tokenClaimsCreate({ sub: "human-callback-test", ...claims })),
      )
      const stateStore = memoryPkceStateStoreCreate({ now: () => nowSeconds * 1000 })
      const sessionStore = memorySessionStoreCreate({ sessionIdCreate: () => crypto.randomUUID() })
      let membershipCalls = 0
      let idToken: string | undefined
      const oidcClient = {
        discoveryRead: async () => ({
          success: true as const,
          data: {
            issuer: config.issuer,
            authorization_endpoint: "https://zitadel.example.test/oauth/authorize",
            token_endpoint: "https://zitadel.example.test/oauth/token",
            jwks_uri: "https://zitadel.example.test/oauth/keys",
          },
        }),
        authorizationUrlCreate: async (input: { nonce: string }) => {
          if (idTokenClaims !== undefined) {
            idToken = await tokenCreate(
              keys.privateKey,
              tokenClaimsCreate({ ...idTokenClaims, aud: callbackConfig.clientId, nonce: input.nonce }),
            )
          }
          return {
            success: true as const,
            data: "https://zitadel.example.test/authorize",
          }
        },
        authorizationCodeExchange: async () => ({
          success: true as const,
          data: { access_token: token, token_type: "Bearer", expires_in: 600, id_token: idToken },
        }),
        organizationMembershipRead: async (_accessToken: string, organizationId: string) => {
          membershipCalls += 1
          if (membershipFailure)
            return { success: false as const, op: "testMembershipFailure", errorMessage: "membership lookup failed" }
          return {
            success: true as const,
            data:
              membershipOrganizationId === organizationId &&
              membershipRoles.some((role) => administratorRoles.has(role)),
          }
        },
      }
      const initiation = await humanLoginInitiate(
        { returnTo: "/projects" },
        {
          config: callbackConfig,
          stateStore,
          oidcClient,
          now: () => nowSeconds * 1000,
          randomBytes: (size) => new Uint8Array(size).fill(7),
        },
      )
      expect(initiation.success).toBe(true)
      if (!initiation.success) return { result: initiation, membershipCalls }
      const result = await humanLoginCallback(
        { code: "one-time-code", state: initiation.data.state },
        initiation.data.state,
        {
          config: callbackConfig,
          stateStore,
          sessionStore,
          oidcClient,
          jwksClient: zitadelJwksClientMemoryCreate([jwk]),
          jwksUri: "https://zitadel.example.test/oauth/keys",
          now: () => nowSeconds * 1000,
        },
      )
      return { result, membershipCalls }
    }

    const claimedOwner = await callbackRun({ assets_project_grants: {}, "urn:zitadel:iam:org:id": "org-1" }, [
      "ORG_OWNER",
    ])
    expect(claimedOwner.result).toMatchObject({ success: true, data: { principal: { organizationAdmin: true } } })
    expect(claimedOwner.membershipCalls).toBe(1)

    const claimlessOwner = await callbackRun({ assets_project_grants: {}, "urn:zitadel:iam:org:id": undefined }, [
      "ORG_OWNER",
    ])
    expect(claimlessOwner.result).toMatchObject({
      success: true,
      data: { principal: { organizationId: "org-1", organizationAdmin: true } },
    })
    expect(claimlessOwner.membershipCalls).toBe(1)

    const regularUser = await callbackRun({ assets_project_grants: {}, "urn:zitadel:iam:org:id": undefined }, [])
    expect(regularUser.result.success).toBe(false)
    expect(regularUser.membershipCalls).toBe(1)

    const claimlessGrantUser = await callbackRun({ "urn:zitadel:iam:org:id": undefined }, [])
    expect(claimlessGrantUser.result.success).toBe(false)
    expect(claimlessGrantUser.membershipCalls).toBe(1)

    const wrongOrganization = await callbackRun({ assets_project_grants: {}, "urn:zitadel:iam:org:id": "org-2" }, [
      "ORG_OWNER",
    ])
    expect(wrongOrganization.result.success).toBe(false)
    expect(wrongOrganization.membershipCalls).toBe(0)

    const wrongMembershipOrganization = await callbackRun(
      { assets_project_grants: {}, "urn:zitadel:iam:org:id": undefined },
      ["ORG_OWNER"],
      "org-2",
    )
    expect(wrongMembershipOrganization.result.success).toBe(false)
    expect(wrongMembershipOrganization.membershipCalls).toBe(1)

    const unrelatedRole = await callbackRun({ assets_project_grants: {}, "urn:zitadel:iam:org:id": undefined }, [
      "ORG_PROJECT_CREATOR",
    ])
    expect(unrelatedRole.result.success).toBe(false)
    expect(unrelatedRole.membershipCalls).toBe(1)

    const existingGrant = await callbackRun({}, [])
    expect(existingGrant.result).toMatchObject({ success: true, data: { principal: { organizationAdmin: false } } })
    expect(existingGrant.membershipCalls).toBe(1)

    const accessTokenName = await callbackRun({ name: "Access token name" }, [])
    expect(accessTokenName.result).toMatchObject({ success: true, data: { principal: { organizationAdmin: false } } })
    if (accessTokenName.result.success) expect(accessTokenName.result.data.principal).not.toHaveProperty("displayName")

    const mismatchedIdToken = await callbackRun({}, [], config.organizationId, (token) => token, false, {
      sub: "different-user",
      name: "Different User",
    })
    expect(mismatchedIdToken.result.success).toBe(false)
    expect(mismatchedIdToken.membershipCalls).toBe(0)

    const clockSkewedIdToken = await callbackRun(
      {},
      [],
      config.organizationId,
      (token) => token,
      false,
      { sub: "human-callback-test", name: "Near Expiry", exp: nowSeconds - 30 },
      { ...config, clockSkewSeconds: 60 },
    )
    expect(clockSkewedIdToken.result).toMatchObject({
      success: true,
      data: { principal: { displayName: "Near Expiry" } },
    })

    const unavailableRegularUser = await callbackRun({}, [], config.organizationId, (token) => token, true)
    expect(unavailableRegularUser.result).toMatchObject({
      success: true,
      data: { principal: { organizationId: "org-1", organizationAdmin: false } },
    })
    expect(unavailableRegularUser.membershipCalls).toBe(1)

    const unavailableClaimlessUser = await callbackRun(
      { "urn:zitadel:iam:org:id": undefined },
      [],
      config.organizationId,
      (token) => token,
      true,
    )
    expect(unavailableClaimlessUser.result.success).toBe(false)
    expect(unavailableClaimlessUser.membershipCalls).toBe(1)

    const unavailableGrantlessUser = await callbackRun(
      { assets_project_grants: {}, "urn:zitadel:iam:org:id": "org-1" },
      [],
      config.organizationId,
      (token) => token,
      true,
    )
    expect(unavailableGrantlessUser.result.success).toBe(false)
    expect(unavailableGrantlessUser.membershipCalls).toBe(1)

    for (const invalidClaims of [
      { iss: "https://wrong.example.test" },
      { aud: ["wrong-audience"] },
      { sub: undefined },
      { exp: nowSeconds - 1 },
    ]) {
      const invalid = await callbackRun(
        { assets_project_grants: {}, "urn:zitadel:iam:org:id": undefined, ...invalidClaims },
        ["ORG_OWNER"],
      )
      expect(invalid.result.success).toBe(false)
      expect(invalid.membershipCalls).toBe(0)
    }

    const invalidSignature = await callbackRun(
      { assets_project_grants: {}, "urn:zitadel:iam:org:id": undefined },
      ["ORG_OWNER"],
      config.organizationId,
      (token) => `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`,
    )
    expect(invalidSignature.result.success).toBe(false)
    expect(invalidSignature.membershipCalls).toBe(0)
  })

  test("selects the configured organization from mixed role claims without cross-organization elevation", async () => {
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const config = configCreate()
    const token = await tokenCreate(
      keys.privateKey,
      tokenClaimsCreate({
        sub: "mixed-organization-user",
        assets_project_grants: undefined,
        "urn:zitadel:iam:org:id": undefined,
        project_id: config.projectId,
        "urn:zitadel:iam:org:project:roles": {
          "assets.admin": { "org-2": "" },
          "assets.uploader": { "org-1": "" },
        },
      }),
    )
    const principal = await jwtPrincipalValidate(token, {
      issuer: config.issuer,
      audience: config.audience,
      jwksUri: "https://zitadel.example.test/oauth/keys",
      jwksClient: zitadelJwksClientMemoryCreate([jwk]),
      organizationId: config.organizationId,
      defaultProjectId: config.projectId,
      method: "human_session",
      allowMissingOrganizationClaim: true,
      now: () => nowSeconds * 1000,
    })
    expect(principal).toMatchObject({
      success: true,
      data: {
        organizationId: "org-1",
        organizationAdmin: false,
        grants: [{ projectId: "zitadel-project-1", roles: ["contributor"] }],
      },
    })
    if (!principal.success) return

    const sameOrganizationBinding = {
      id: "binding-1",
      projectId: "service-project-1",
      organizationId: "org-1",
      zitadelProjectId: "zitadel-project-1",
      serviceProjectId: "service-project-1",
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    }
    const otherOrganizationBinding = { ...sameOrganizationBinding, organizationId: "org-2" }
    expect(
      projectAuthorizationCheck(principal.data, sameOrganizationBinding, "contributor", "service-project-1"),
    ).toEqual({ success: true, data: true })
    expect(
      projectAuthorizationCheck(principal.data, sameOrganizationBinding, "admin", "service-project-1").success,
    ).toBe(false)
    expect(
      projectAuthorizationCheck(principal.data, otherOrganizationBinding, "admin", "service-project-1").success,
    ).toBe(false)
  })

  test("keeps organization-admin, regular-grant, wrong-organization, and service-account authorization separate", async () => {
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const token = await tokenCreate(keys.privateKey, tokenClaimsCreate())
    const principal = await serviceBearerValidate(
      new Request("https://assets.example.test", { headers: { authorization: `Bearer ${token}` } }),
      {
        issuer: "https://zitadel.example.test",
        audience: "assets-api",
        jwksUri: "https://zitadel.example.test/oauth/v2/keys",
        jwksClient: zitadelJwksClientMemoryCreate([jwk]),
        organizationId: "org-1",
        serviceAccountClientId: "machine-client-1",
        now: () => nowSeconds * 1000,
      },
    )
    expect(principal.success).toBe(true)
    if (!principal.success) return

    const binding = {
      id: "binding-1",
      projectId: "service-project-1",
      organizationId: "org-1",
      zitadelProjectId: "zitadel-project-1",
      serviceProjectId: "service-project-1",
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    }
    const ungrantedBinding = { ...binding, zitadelProjectId: "zitadel-project-2" }
    const wrongOrganizationBinding = { ...ungrantedBinding, organizationId: "org-2" }
    const organizationAdmin = {
      ...principal.data,
      method: "human_session" as const,
      organizationAdmin: true,
      grants: [{ projectId: "zitadel-project-1", roles: ["contributor" as const] }],
    }
    const regularUser = { ...organizationAdmin, organizationAdmin: false }

    expect(projectAuthorizationCheck(organizationAdmin, ungrantedBinding, "admin", binding.serviceProjectId)).toEqual({
      success: true,
      data: true,
    })
    expect(
      projectAuthorizationCheck(organizationAdmin, wrongOrganizationBinding, "contributor", binding.serviceProjectId)
        .success,
    ).toBe(false)
    expect(projectAuthorizationCheck(regularUser, binding, "contributor", binding.serviceProjectId).success).toBe(true)
    expect(
      projectAuthorizationCheck(regularUser, ungrantedBinding, "contributor", binding.serviceProjectId).success,
    ).toBe(false)
    expect(
      projectAuthorizationCheck(principal.data, ungrantedBinding, "contributor", binding.serviceProjectId).success,
    ).toBe(false)
  })

  test("keeps provisioning and grants deterministic and doctor output secret-free", async () => {
    const provisioning = zitadelProvisioningAdapterMemoryCreate()
    const provisioned = await provisioning.projectProvision({
      organizationId: "org-1",
      projectId: "zitadel-project-1",
      serviceProjectId: "service-project-1",
      clientId: "human-client-1",
      redirectUris: ["https://assets.example.test/auth/callback"],
      postLogoutRedirectUris: ["https://assets.example.test/"],
    })
    expect(provisioned).toMatchObject({ success: true, data: { roleKeys: ["contributor", "admin"] } })

    const grants = zitadelGrantAdapterMemoryCreate()
    const provisionedWithGrant = await zitadelProvisioningAdapterMemoryCreate({
      grantAdapter: grants,
    }).projectProvision({
      organizationId: "org-1",
      projectId: "zitadel-project-1",
      serviceProjectId: "service-project-1",
      clientId: "human-client-1",
      redirectUris: ["https://assets.example.test/auth/callback"],
      postLogoutRedirectUris: ["https://assets.example.test/"],
      grantRequests: [
        {
          organizationId: "org-1",
          projectId: "zitadel-project-1",
          subjectId: "machine-client-1",
          subjectType: "service_account",
          roles: ["admin"],
        },
      ],
    })
    expect(provisionedWithGrant.success).toBe(true)
    const machineGrants = await grants.grantsRead("org-1", "zitadel-project-1", "machine-client-1")
    expect(machineGrants.success && machineGrants.data).toHaveLength(1)

    const config = configCreate()
    const report = await zitadelCredentialDoctor({
      config,
      oidcClient: {
        discoveryRead: async () => ({
          success: true as const,
          data: {
            issuer: config.issuer,
            authorization_endpoint: "https://zitadel.example.test/oauth/authorize",
            token_endpoint: "https://zitadel.example.test/oauth/token",
            jwks_uri: "https://zitadel.example.test/oauth/keys",
          },
        }),
        authorizationUrlCreate: async () => ({
          success: true as const,
          data: "https://zitadel.example.test/authorize",
        }),
        authorizationCodeExchange: async () => ({ success: false as const, op: "test", errorMessage: "not used" }),
        organizationMembershipRead: async () => ({ success: true as const, data: false }),
      },
      jwksClient: zitadelJwksClientMemoryCreate([{ kty: "RSA", kid: "key-1" }]),
    })
    expect(report).toMatchObject({ success: true, data: { healthy: true } })
    expect(JSON.stringify(report)).not.toContain("secret")
  })

  test("stores sessions as hashed opaque ids and rotates them atomically", async () => {
    const databasePath = `/tmp/assets-service-auth-${crypto.randomUUID()}.sqlite`
    const opened = databaseOpen(databasePath)
    expect(opened.success).toBe(true)
    if (!opened.success) return
    try {
      const created = databaseSessionStoreCreate(opened.data)
      expect(created.success).toBe(true)
      if (!created.success) return
      const now = Math.floor(Date.now() / 1000)
      const session: AuthenticationSession = {
        principal: {
          subjectId: "human-1",
          displayName: "Ada Lovelace",
          organizationId: "org-1",
          organizationAdmin: false,
          method: "human_session" as const,
          grants: [{ projectId: "project-1", roles: ["contributor"] }],
          issuedAt: now,
          expiresAt: now + 3600,
        },
        createdAt: now,
        expiresAt: now + 3600,
        rotateAt: now + 60,
      }
      const id = await created.data.create(session)
      expect(id.success).toBe(true)
      if (!id.success) return
      expect(id.data).not.toContain("human-1")
      expect(await created.data.read(id.data)).toMatchObject({ success: true, data: session })
      const rotated = await created.data.rotate(id.data, { ...session, rotateAt: now + 120 })
      expect(rotated.success).toBe(true)
      expect(await created.data.read(id.data)).toEqual({ success: true, data: null })
      if (rotated.success) {
        expect(await created.data.read(rotated.data)).toMatchObject({
          success: true,
          data: { ...session, rotateAt: now + 120 },
        })
      }
    } finally {
      databaseClose(opened.data)
      await rm(databasePath, { force: true })
      await rm(`${databasePath}-wal`, { force: true })
      await rm(`${databasePath}-shm`, { force: true })
    }
  })

  test("makes users of Org Contentoren admins by default and maps legacy roles", async () => {
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const token = await tokenCreate(
      keys.privateKey,
      tokenClaimsCreate({
        sub: "contentoren-user-1",
        "urn:zitadel:iam:org:id": "380716752838852623",
        assets_project_grants: { "zitadel-project-1": ["assets.uploader"], "zitadel-project-2": ["assets.admin"] },
      }),
    )
    const principal = await jwtPrincipalValidate(token, {
      issuer: "https://zitadel.example.test",
      audience: "assets-api",
      jwksUri: "https://zitadel.example.test/oauth/v2/keys",
      jwksClient: zitadelJwksClientMemoryCreate([jwk]),
      organizationId: "380716752838852623",
      method: "human_session",
      allowMissingOrganizationClaim: true,
      now: () => nowSeconds * 1000,
    })
    expect(principal).toMatchObject({
      success: true,
      data: {
        organizationId: "380716752838852623",
        organizationAdmin: true,
        grants: [
          { projectId: "zitadel-project-1", roles: ["contributor"] },
          { projectId: "zitadel-project-2", roles: ["admin"] },
        ],
      },
    })
  })
})
