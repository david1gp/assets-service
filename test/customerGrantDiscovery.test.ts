import { describe, expect, test } from "bun:test"
import { humanLoginCallback } from "../src/authentication/humanLoginCallback.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { sessionAccessTokenStoreCreate } from "../src/authentication/sessionAccessTokenStoreCreate.js"
import { sessionOrganizationSwitch } from "../src/authentication/sessionOrganizationSwitch.js"
import { userGrantsNormalize } from "../src/authentication/userGrantsNormalize.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"
import type { ZitadelAuthConfig } from "../src/authentication/zitadelAuthConfigSchema.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import type { ZitadelJwk } from "../src/infrastructure/zitadel/zitadelJwk.js"
import { zitadelJwksClientMemoryCreate } from "../src/infrastructure/zitadel/zitadelJwksClientMemoryCreate.js"
import type { ZitadelOidcClient } from "../src/infrastructure/zitadel/zitadelOidcClient.js"
import { zitadelOidcClientCreate } from "../src/infrastructure/zitadel/zitadelOidcClientCreate.js"
import type { ZitadelUserGrant } from "../src/infrastructure/zitadel/zitadelUserGrantSchema.js"
import { projectRepositoryCreate } from "../src/project/projectRepositoryCreate.js"

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

const jwkCreate = async (publicKey: CryptoKey): Promise<ZitadelJwk> => {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey)
  return { ...(jwk as unknown as ZitadelJwk), kid: "key-1", alg: "RS256", use: "sig" }
}

const multiOrgMappings = [
  { ownerOrganizationId: "org-contentoren", customerOrganizationId: "org-contentoren-customers" },
  { ownerOrganizationId: "org-fabian", customerOrganizationId: "org-fabian-customers" },
  { ownerOrganizationId: "org-david" },
] as const

const config: ZitadelAuthConfig = {
  issuer: "https://zitadel.example.test",
  clientId: "human-client-1",
  redirectUri: "https://assets.example.test/auth/callback",
  audience: "assets-api",
  organizationId: "org-contentoren",
  customerOrganizationId: "org-contentoren-customers",
  organizationMappings: multiOrgMappings,
  projectId: "assets-service-client-proj",
  sessionCookieName: "assets_session",
  stateCookieName: "assets_state",
  sessionTtlSeconds: 3600,
  sessionRotationSeconds: 60,
  clockSkewSeconds: 0,
  jwksCacheTtlSeconds: 300,
}

describe("Customer Grant Discovery Regression Tests", () => {
  const setupCallback = async (options: {
    orgId: string
    tokenProjectRoles?: Record<string, unknown>
    tokenCustomProjectGrants?: Record<string, unknown>
    userGrants?: ZitadelUserGrant[]
    userGrantsFails?: boolean
    isExactMember?: boolean
    isOrganizationAdmin?: boolean
  }) => {
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const jwksClient = zitadelJwksClientMemoryCreate([jwk])
    const stateStore = memoryPkceStateStoreCreate({ now: () => nowSeconds * 1000 })
    const sessionStore = memorySessionStoreCreate()
    const sessionAccessTokenStore = sessionAccessTokenStoreCreate()

    const accessTokenClaims: Record<string, unknown> = {
      iss: config.issuer,
      aud: [config.audience],
      sub: `user-${options.orgId}`,
      iat: nowSeconds - 60,
      exp: nowSeconds + 600,
      "urn:zitadel:iam:org:id": options.orgId,
      "urn:zitadel:iam:user:resourceowner:id": options.orgId,
    }
    if (options.tokenProjectRoles !== undefined) {
      accessTokenClaims["urn:zitadel:iam:org:project:roles"] = options.tokenProjectRoles
    }
    if (options.tokenCustomProjectGrants !== undefined) {
      accessTokenClaims.assets_project_grants = options.tokenCustomProjectGrants
    }

    const accessToken = await tokenCreate(keys.privateKey, accessTokenClaims)
    const idToken = await tokenCreate(keys.privateKey, {
      iss: config.issuer,
      aud: [config.clientId],
      sub: `user-${options.orgId}`,
      iat: nowSeconds - 60,
      exp: nowSeconds + 600,
      name: `User ${options.orgId}`,
      nonce: "test-nonce",
    })

    await stateStore.save("test-state", {
      codeVerifier: "test-verifier",
      nonce: "test-nonce",
      returnTo: "/projects",
      createdAt: nowSeconds,
      expiresAt: nowSeconds + 600,
    })

    const oidcClient: ZitadelOidcClient = {
      discoveryRead: async () => ({
        success: true as const,
        data: {
          issuer: config.issuer,
          authorization_endpoint: "https://zitadel.example.test/oauth/v2/authorize",
          token_endpoint: "https://zitadel.example.test/oauth/v2/token",
          jwks_uri: "https://zitadel.example.test/oauth/v2/keys",
        },
      }),
      authorizationUrlCreate: async () => ({ success: true as const, data: "https://login" }),
      authorizationCodeExchange: async () => ({
        success: true as const,
        data: { access_token: accessToken, id_token: idToken, token_type: "Bearer", expires_in: 3600 },
      }),
      organizationMembershipRead: async () => ({
        success: true as const,
        data: {
          isExactMember: options.isExactMember ?? true,
          isOrganizationAdmin: options.isOrganizationAdmin ?? false,
          displayName: "Test Customer Org",
        },
      }),
      userGrantsRead: async () => {
        if (options.userGrantsFails) {
          return { success: false as const, op: "zitadelUserGrantsRead", errorMessage: "Zitadel error" }
        }
        return { success: true as const, data: options.userGrants ?? [] }
      },
    }

    const result = await humanLoginCallback({ code: "test-code", state: "test-state" }, "test-state", {
      config,
      stateStore,
      sessionStore,
      sessionAccessTokenStore,
      oidcClient,
      jwksClient,
      now: () => nowSeconds * 1000,
    })

    return { result, sessionStore, sessionAccessTokenStore, oidcClient }
  }

  test("cross-project contributor callback succeeds without token claims", async () => {
    // Live Fabian customer has active contributor grant to bound Fabian SSO Test project,
    // exact org membership, but OIDC client's token includes only own Assets Service project role claims
    // (or no token claims at all).
    const { result } = await setupCallback({
      orgId: "org-fabian-customers",
      // Token only contains claims for Assets Service own client project, not the bound project
      tokenProjectRoles: {
        "assets.user": { "org-fabian-customers": "role" },
      },
      userGrants: [
        {
          projectId: "fabian-sso-test-project",
          orgId: "org-fabian-customers",
          state: "USER_GRANT_STATE_ACTIVE",
          roleKeys: ["assets.uploader"],
        },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.principal.organizationId).toBe("org-fabian-customers")
      expect(result.data.principal.mode).toBe("contributor")
      expect(result.data.principal.organizationAdmin).toBe(false)
      expect(result.data.principal.grants).toEqual([{ projectId: "fabian-sso-test-project", roles: ["contributor"] }])
    }
  })

  test("inactive/foreign/no grants denial", async () => {
    // 1. Inactive grant is denied
    const inactiveResult = await setupCallback({
      orgId: "org-fabian-customers",
      userGrants: [
        {
          projectId: "fabian-sso-test-project",
          orgId: "org-fabian-customers",
          state: "USER_GRANT_STATE_INACTIVE",
          roleKeys: ["assets.uploader"],
        },
      ],
    })
    expect(inactiveResult.result.success).toBe(false)
    if (!inactiveResult.result.success) {
      expect(inactiveResult.result.errorMessage).toBe("The JWT did not contain the required project grant")
    }

    // 2. Foreign organization grant is denied (cross-tenant leakage prevented)
    const foreignResult = await setupCallback({
      orgId: "org-fabian-customers",
      userGrants: [
        {
          projectId: "contentoren-project",
          orgId: "org-contentoren-customers",
          state: "USER_GRANT_STATE_ACTIVE",
          roleKeys: ["assets.uploader"],
        },
      ],
    })
    expect(foreignResult.result.success).toBe(false)
    if (!foreignResult.result.success) {
      expect(foreignResult.result.errorMessage).toBe("The JWT did not contain the required project grant")
    }

    // 3. No grants at all is denied
    const noGrantsResult = await setupCallback({
      orgId: "org-fabian-customers",
      userGrants: [],
    })
    expect(noGrantsResult.result.success).toBe(false)
    if (!noGrantsResult.result.success) {
      expect(noGrantsResult.result.errorMessage).toBe("The JWT did not contain the required project grant")
    }
  })

  test("customer admin never enabled", async () => {
    // Case A: Customer user grant in Zitadel only has admin role -> customer admin is rejected entirely
    const adminOnlyResult = await setupCallback({
      orgId: "org-fabian-customers",
      isOrganizationAdmin: true,
      userGrants: [
        {
          projectId: "fabian-sso-test-project",
          orgId: "org-fabian-customers",
          state: "USER_GRANT_STATE_ACTIVE",
          roleKeys: ["assets.admin", "admin"],
        },
      ],
    })
    expect(adminOnlyResult.result.success).toBe(false)
    if (!adminOnlyResult.result.success) {
      expect(adminOnlyResult.result.errorMessage).toBe("The JWT did not contain the required project grant")
    }

    // Case B: Customer user grant has both admin and contributor -> admin is stripped, only contributor allowed
    const mixedResult = await setupCallback({
      orgId: "org-fabian-customers",
      isOrganizationAdmin: true,
      userGrants: [
        {
          projectId: "fabian-sso-test-project",
          orgId: "org-fabian-customers",
          state: "USER_GRANT_STATE_ACTIVE",
          roleKeys: ["assets.admin", "assets.uploader"],
        },
      ],
    })
    expect(mixedResult.result.success).toBe(true)
    if (mixedResult.result.success) {
      expect(mixedResult.result.data.principal.mode).toBe("contributor")
      expect(mixedResult.result.data.principal.organizationAdmin).toBe(false)
      expect(mixedResult.result.data.principal.grants).toEqual([
        { projectId: "fabian-sso-test-project", roles: ["contributor"] },
      ])
      // Explicitly ensure admin role was never assigned
      expect(mixedResult.result.data.principal.grants[0]?.roles).not.toContain("admin")
    }
  })

  test("live owner grants replace stale token grants", async () => {
    const result = await setupCallback({
      orgId: "org-fabian",
      tokenCustomProjectGrants: {
        "org-fabian": {
          "fabian-sso-test-project": ["admin"],
        },
      },
      userGrants: [
        {
          projectId: "fabian-sso-test-project",
          orgId: "org-fabian",
          state: "USER_GRANT_STATE_INACTIVE",
          roleKeys: ["assets.admin"],
        },
      ],
    })

    expect(result.result.success).toBe(true)
    if (result.result.success) {
      expect(result.result.data.principal.grants).toEqual([])
    }
  })

  test("multi-org switch target grants", async () => {
    const connection = databaseOpen(":memory:")
    if (!connection.success) throw new Error(connection.errorMessage)
    const migrated = databaseMigrate(connection.data)
    if (!migrated.success) throw new Error(migrated.errorMessage)
    const projectRepository = projectRepositoryCreate(connection.data.db)

    // Create Fabian project and Contentoren project
    const fabianProject = projectRepository.projectCreate(
      {
        organization: { id: "org-fabian", name: "Fabian", slug: "fabian" },
        name: "Fabian App",
        slug: "fabian-app",
        defaultEnvironment: "development",
        binding: { zitadelProjectId: "zit-fabian-1", serviceProjectId: "srv-fabian-1" },
        environments: [
          { name: "development", r2Bucket: "b", r2Prefix: "f/dev", publicBaseUrl: "https://fabian.test" },
          { name: "production", r2Bucket: "b", r2Prefix: "f/prod", publicBaseUrl: "https://fabian.test" },
        ],
      },
      "seed",
    )
    expect(fabianProject.success).toBe(true)

    const contentorenProject = projectRepository.projectCreate(
      {
        organization: { id: "org-contentoren", name: "Contentoren", slug: "contentoren" },
        name: "Contentoren App",
        slug: "contentoren-app",
        defaultEnvironment: "development",
        binding: { zitadelProjectId: "zit-contentoren-1", serviceProjectId: "srv-contentoren-1" },
        environments: [
          { name: "development", r2Bucket: "b", r2Prefix: "c/dev", publicBaseUrl: "https://contentoren.test" },
          { name: "production", r2Bucket: "b", r2Prefix: "c/prod", publicBaseUrl: "https://contentoren.test" },
        ],
      },
      "seed",
    )
    expect(contentorenProject.success).toBe(true)

    const sessionAccessTokenStore = sessionAccessTokenStoreCreate()
    const rawAccessToken = "mock-access-token"
    const tokenRef = sessionAccessTokenStore.create(rawAccessToken, nowSeconds + 3600)
    expect(tokenRef.success).toBe(true)
    if (!tokenRef.success) throw new Error(tokenRef.errorMessage)

    // Initial session logged in as Fabian owner
    const initialSession: AuthenticationSession = {
      principal: {
        subjectId: "user-david",
        organizationId: "org-fabian",
        mode: "admin",
        organizationAdmin: true,
        method: "human_session",
        grants: [{ projectId: "zit-fabian-1", roles: ["admin"] }],
        issuedAt: nowSeconds - 60,
        expiresAt: nowSeconds + 3600,
      },
      createdAt: nowSeconds - 60,
      expiresAt: nowSeconds + 3600,
      rotateAt: nowSeconds + 900,
      identityOrganizationId: "org-fabian",
      identityGrants: [{ projectId: "zit-fabian-1", roles: ["admin"] }],
      accessTokenReference: tokenRef.data,
    }

    // Mock Zitadel client:
    // Returns grants across multiple organizations:
    // - Active contributor grant for Fabian-Customers on zit-fabian-1
    // - Active contributor grant for Contentoren-Customers on zit-contentoren-1 (foreign to Fabian!)
    // - Active admin grant for Fabian owner on zit-fabian-1
    const oidcClient: ZitadelOidcClient = {
      discoveryRead: async () => ({
        success: true as const,
        data: {
          issuer: config.issuer,
          authorization_endpoint: "https://zitadel.example.test/oauth/v2/authorize",
          token_endpoint: "https://zitadel.example.test/oauth/v2/token",
          jwks_uri: "https://zitadel.example.test/oauth/v2/keys",
        },
      }),
      authorizationUrlCreate: async () => ({ success: true as const, data: "https://login" }),
      authorizationCodeExchange: async () => ({
        success: true as const,
        data: { access_token: rawAccessToken, token_type: "Bearer", expires_in: 3600 },
      }),
      organizationMembershipRead: async (_token: string, orgId: string) => {
        if (orgId === "org-fabian-customers") {
          return { success: true as const, data: { isExactMember: true, isOrganizationAdmin: false } }
        }
        if (orgId === "org-fabian") {
          return { success: true as const, data: { isExactMember: true, isOrganizationAdmin: true } }
        }
        return { success: true as const, data: { isExactMember: false, isOrganizationAdmin: false } }
      },
      userGrantsRead: async () => ({
        success: true as const,
        data: [
          {
            projectId: "zit-fabian-1",
            orgId: "org-fabian-customers",
            state: "USER_GRANT_STATE_ACTIVE",
            roleKeys: ["assets.uploader"],
          },
          {
            projectId: "zit-contentoren-1",
            orgId: "org-contentoren-customers",
            state: "USER_GRANT_STATE_ACTIVE",
            roleKeys: ["assets.uploader"],
          },
          {
            projectId: "zit-fabian-1",
            orgId: "org-fabian",
            state: "USER_GRANT_STATE_ACTIVE",
            roleKeys: ["assets.admin"],
          },
        ],
      }),
    }

    // 1. Switch to Fabian Customers:
    // Should use fresh trusted grants scoped strictly to org-fabian-customers.
    // Must NOT leak Contentoren-Customers grant (cross-tenant role leakage prevention).
    const switchToCustomer = await sessionOrganizationSwitch(initialSession, "org-fabian-customers", {
      config,
      oidcClient,
      sessionAccessTokenStore,
      projectRepository,
      now: () => nowSeconds * 1000,
    })

    expect(switchToCustomer.success).toBe(true)
    if (!switchToCustomer.success) throw new Error(switchToCustomer.errorMessage)
    expect(switchToCustomer.data.principal.organizationId).toBe("org-fabian-customers")
    expect(switchToCustomer.data.principal.mode).toBe("contributor")
    expect(switchToCustomer.data.principal.organizationAdmin).toBe(false)
    expect(switchToCustomer.data.principal.grants).toEqual([{ projectId: "zit-fabian-1", roles: ["contributor"] }])
    // Cross-tenant verification: zit-contentoren-1 must NOT be in grants
    expect(switchToCustomer.data.principal.grants.map((g) => g.projectId)).not.toContain("zit-contentoren-1")

    // 2. Switch back to Fabian Owner:
    // Uses fresh trusted grants scoped to org-fabian.
    // Customer contributor grants are NOT leaked into owner grants.
    const switchToOwner = await sessionOrganizationSwitch(switchToCustomer.data, "org-fabian", {
      config,
      oidcClient,
      sessionAccessTokenStore,
      projectRepository,
      now: () => nowSeconds * 1000,
    })

    expect(switchToOwner.success).toBe(true)
    if (switchToOwner.success) {
      expect(switchToOwner.data.principal.organizationId).toBe("org-fabian")
      expect(switchToOwner.data.principal.mode).toBe("admin")
      expect(switchToOwner.data.principal.organizationAdmin).toBe(true)
      expect(switchToOwner.data.principal.grants).toEqual([{ projectId: "zit-fabian-1", roles: ["admin"] }])
    }
  })

  test("zitadelOidcClientCreate.userGrantsRead pagination handles multiple pages", async () => {
    const requestedBodies: unknown[] = []
    const client = zitadelOidcClientCreate({
      config,
      fetcher: async (input, init) => {
        const url = String(input)
        if (url.endsWith("/.well-known/openid-configuration")) {
          return new Response(
            JSON.stringify({
              issuer: config.issuer,
              authorization_endpoint: "https://zitadel.example.test/oauth/v2/authorize",
              token_endpoint: "https://zitadel.example.test/oauth/v2/token",
              jwks_uri: "https://zitadel.example.test/oauth/v2/keys",
            }),
          )
        }
        if (url.endsWith("/auth/v1/usergrants/me/_search")) {
          const parsedBody = JSON.parse(String(init?.body))
          requestedBodies.push(parsedBody)
          const offset = parsedBody.query?.offset ?? 0

          if (offset === 0) {
            // First page: return 100 items with totalResult 150
            const page = Array.from({ length: 100 }, (_, i) => ({
              projectId: `proj-${i}`,
              orgId: "org-fabian-customers",
              state: "USER_GRANT_STATE_ACTIVE",
              roleKeys: ["assets.uploader"],
            }))
            return new Response(JSON.stringify({ result: page, details: { totalResult: 150 } }), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          }
          if (offset === 100) {
            // Second page: return remaining 50 items
            const page = Array.from({ length: 50 }, (_, i) => ({
              projectId: `proj-${100 + i}`,
              orgId: "org-fabian-customers",
              state: "USER_GRANT_STATE_ACTIVE",
              roleKeys: ["assets.uploader"],
            }))
            return new Response(JSON.stringify({ result: page, details: { totalResult: 150 } }), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          }
        }
        return new Response("Not found", { status: 404 })
      },
    })

    expect(client.userGrantsRead).toBeDefined()
    const result = await client.userGrantsRead!("token-123")
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(150)
      expect(result.data[0]?.projectId).toBe("proj-0")
      expect(result.data[149]?.projectId).toBe("proj-149")
    }
    expect(requestedBodies.length).toBe(2)
  })

  test("userGrantsNormalize properly scopes and filters roles", () => {
    const rawGrants: ZitadelUserGrant[] = [
      { projectId: "p1", orgId: "org-target", state: "USER_GRANT_STATE_ACTIVE", roleKeys: ["assets.uploader"] },
      { projectId: "p2", orgId: "org-target", state: "USER_GRANT_STATE_INACTIVE", roleKeys: ["assets.uploader"] },
      { projectId: "p3", orgId: "org-foreign", state: "USER_GRANT_STATE_ACTIVE", roleKeys: ["assets.uploader"] },
      { projectId: "p4", orgId: "org-target", state: "USER_GRANT_STATE_ACTIVE", roleKeys: ["assets.admin"] },
      { projectId: "p1", orgId: "org-target", state: "USER_GRANT_STATE_ACTIVE", roleKeys: ["contributor"] },
      // The API always supplies an organization. An unscoped mock must never
      // become a grant for a requested target organization.
      {
        projectId: "p5",
        state: "USER_GRANT_STATE_ACTIVE",
        roleKeys: ["assets.uploader"],
      } as unknown as ZitadelUserGrant,
    ]

    // Customer scoping: only org-target, only contributor role
    const customerGrants = userGrantsNormalize(rawGrants, {
      organizationId: "org-target",
      allowedRoles: ["contributor"],
    })
    expect(customerGrants).toEqual([{ projectId: "p1", roles: ["contributor"] }])

    // Owner scoping: org-target, all roles
    const ownerGrants = userGrantsNormalize(rawGrants, {
      organizationId: "org-target",
    })
    expect(ownerGrants).toEqual([
      { projectId: "p1", roles: ["contributor"] },
      { projectId: "p4", roles: ["admin"] },
    ])

    const missingState = userGrantsNormalize(
      [
        {
          projectId: "p6",
          orgId: "org-target",
          state: undefined,
          roleKeys: ["assets.uploader"],
        } as unknown as ZitadelUserGrant,
      ],
      { organizationId: "org-target" },
    )
    expect(missingState).toEqual([])

    const nonEnumState = userGrantsNormalize(
      [
        {
          projectId: "p7",
          orgId: "org-target",
          state: "ACTIVE",
          roleKeys: ["assets.uploader"],
        } as unknown as ZitadelUserGrant,
      ],
      { organizationId: "org-target" },
    )
    expect(nonEnumState).toEqual([])
  })
})
