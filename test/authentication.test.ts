import { describe, expect, test } from "bun:test"
import { rm } from "node:fs/promises"

import { humanLoginCallback } from "../src/authentication/humanLoginCallback.js"
import { humanLoginInitiate } from "../src/authentication/humanLoginInitiate.js"
import { jwtPrincipalValidate } from "../src/authentication/jwtPrincipalValidate.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { projectAuthorizationCheck } from "../src/authentication/projectAuthorizationCheck.js"
import { protectedRequestBoundaryCreate } from "../src/authentication/protectedRequestBoundaryCreate.js"
import { requestAuthenticationRead } from "../src/authentication/requestAuthenticationRead.js"
import { serviceBearerValidate } from "../src/authentication/serviceBearerValidate.js"
import { zitadelCredentialDoctor } from "../src/infrastructure/zitadel/zitadelCredentialDoctor.js"
import { zitadelGrantAdapterMemoryCreate } from "../src/infrastructure/zitadel/zitadelGrantAdapterMemoryCreate.js"
import type { ZitadelJwk } from "../src/infrastructure/zitadel/zitadelJwk.js"
import { zitadelJwksClientCreate } from "../src/infrastructure/zitadel/zitadelJwksClientCreate.js"
import { zitadelJwksClientMemoryCreate } from "../src/infrastructure/zitadel/zitadelJwksClientMemoryCreate.js"
import { zitadelProvisioningAdapterMemoryCreate } from "../src/infrastructure/zitadel/zitadelProvisioningAdapterMemoryCreate.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseSessionStoreCreate } from "../src/authentication/databaseSessionStoreCreate.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"

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
      data: { method: "service_account", grants: [{ projectId: "zitadel-project-1" }] },
    })

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
    expect(standardRole).toMatchObject({ success: true, data: { grants: [{ roles: ["assets.admin"] }] } })
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
    expect(projectAuthorizationCheck(principal.data, binding, "assets.uploader", "service-project-1").success).toBe(
      true,
    )
    expect(projectAuthorizationCheck(principal.data, binding, "assets.admin", "service-project-1").success).toBe(false)
    expect(projectAuthorizationCheck(principal.data, binding, "assets.uploader", "other-service-project").success).toBe(
      false,
    )

    const boundary = protectedRequestBoundaryCreate({
      authenticationRead: async () => ({ success: true as const, data: { principal: principal.data } }),
      authorizationCheck: async () =>
        projectAuthorizationCheck(principal.data, binding, "assets.uploader", "service-project-1"),
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
      authorizationUrlCreate: async (input: { state: string; codeChallenge: string }) => ({
        success: true as const,
        data: `https://zitadel.example.test/oauth/authorize?state=${input.state}&code_challenge=${input.codeChallenge}`,
      }),
      authorizationCodeExchange: async () => ({
        success: true as const,
        data: { access_token: token, token_type: "Bearer", expires_in: 600 },
      }),
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
    expect(provisioned).toMatchObject({ success: true, data: { roleKeys: ["assets.uploader", "assets.admin"] } })

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
          roles: ["assets.admin"],
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
          organizationId: "org-1",
          method: "human_session" as const,
          grants: [{ projectId: "project-1", roles: ["assets.uploader"] }],
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
})
