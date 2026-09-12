import { describe, expect, test } from "bun:test"
import { apiAppCreate } from "../src/api/apiAppCreate.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { sessionAccessTokenStoreCreate } from "../src/authentication/sessionAccessTokenStoreCreate.js"
import { sessionCookieCreate } from "../src/authentication/sessionCookieCreate.js"
import { sessionCookieRead } from "../src/authentication/sessionCookieRead.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"
import type { ZitadelAuthConfig } from "../src/authentication/zitadelAuthConfigSchema.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { zitadelJwksClientMemoryCreate } from "../src/infrastructure/zitadel/zitadelJwksClientMemoryCreate.js"
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

describe("Organization Switching HTTP API", () => {
  const setupFixture = async () => {
    const keys = await keyPairCreate()
    const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey)
    const jwks = [{ ...(jwk as Record<string, unknown>), kid: "key-1", alg: "RS256", use: "sig" }]

    const multiOrgMappings = [
      { ownerOrganizationId: "org-contentoren", customerOrganizationId: "org-contentoren-customers" },
      { ownerOrganizationId: "org-fabian", customerOrganizationId: "org-fabian-customers" },
      { ownerOrganizationId: "org-david" },
    ] as const

    const config: ZitadelAuthConfig = {
      issuer: "https://zitadel.example.test",
      clientId: "human-client-1",
      redirectUri: "https://assets.example.test/api/v1/auth/callback",
      audience: "assets-service",
      organizationId: "org-contentoren",
      customerOrganizationId: "org-contentoren-customers",
      organizationMappings: multiOrgMappings,
      projectId: "zitadel-assets-project",
      sessionCookieName: "assets_session",
      stateCookieName: "assets_state",
      sessionTtlSeconds: 3600,
      sessionRotationSeconds: 900,
      clockSkewSeconds: 30,
      jwksCacheTtlSeconds: 300,
    }

    const connection = databaseOpen(":memory:")
    if (!connection.success) throw new Error(connection.errorMessage)
    const migrated = databaseMigrate(connection.data)
    if (!migrated.success) throw new Error(migrated.errorMessage)
    const projectRepository = projectRepositoryCreate(connection.data.db)

    // Seed projects across organizations
    const contentorenCreated = projectRepository.projectCreate(
      {
        organization: { id: "org-contentoren", name: "Contentoren", slug: "contentoren" },
        name: "Contentoren Main",
        slug: "contentoren-main",
        defaultEnvironment: "development",
        binding: { zitadelProjectId: "zit-c1", serviceProjectId: "srv-c1" },
        environments: [
          { name: "development", r2Bucket: "b", r2Prefix: "c1/dev", publicBaseUrl: "https://c1.test" },
          { name: "production", r2Bucket: "b", r2Prefix: "c1/prod", publicBaseUrl: "https://c1.test" },
        ],
      },
      "seed",
    )

    const davidCreated = projectRepository.projectCreate(
      {
        organization: { id: "org-david", name: "David Org", slug: "david" },
        name: "David Main",
        slug: "david-main",
        defaultEnvironment: "development",
        binding: { zitadelProjectId: "zit-d1", serviceProjectId: "srv-d1" },
        environments: [
          { name: "development", r2Bucket: "b", r2Prefix: "d1/dev", publicBaseUrl: "https://d1.test" },
          { name: "production", r2Bucket: "b", r2Prefix: "d1/prod", publicBaseUrl: "https://d1.test" },
        ],
      },
      "seed",
    )

    const fabianCreated = projectRepository.projectCreate(
      {
        organization: { id: "org-fabian", name: "Fabian", slug: "fabian" },
        name: "Fabian Main",
        slug: "fabian-main",
        defaultEnvironment: "development",
        binding: { zitadelProjectId: "zit-f1", serviceProjectId: "srv-f1" },
        environments: [
          { name: "development", r2Bucket: "b", r2Prefix: "f1/dev", publicBaseUrl: "https://f1.test" },
          { name: "production", r2Bucket: "b", r2Prefix: "f1/prod", publicBaseUrl: "https://f1.test" },
        ],
      },
      "seed",
    )

    const sessionStore = memorySessionStoreCreate()
    const sessionAccessTokenStore = sessionAccessTokenStoreCreate()
    const stateStore = memoryPkceStateStoreCreate({ now: () => nowSeconds * 1000 })
    const jwksClient = zitadelJwksClientMemoryCreate(jwks as any)

    // David's memberships in Zitadel:
    // resourceOwner: Contentoren
    // ORG_OWNER in Contentoren, David, Fabian
    // Member with ORG_OWNER in Fabian-Customers (to test customer isolation!)
    const memberships: Record<string, { isExactMember: boolean; isOrganizationAdmin: boolean; displayName?: string }> =
      {
        "org-contentoren": { isExactMember: true, isOrganizationAdmin: true, displayName: "Contentoren" },
        "org-david": { isExactMember: true, isOrganizationAdmin: true, displayName: "David" },
        "org-fabian": { isExactMember: true, isOrganizationAdmin: true, displayName: "Fabian" },
        "org-fabian-customers": { isExactMember: true, isOrganizationAdmin: true, displayName: "Fabian Customers" },
        "org-unauthorized": { isExactMember: false, isOrganizationAdmin: false },
      }

    const oidcClient = {
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
        data: { access_token: "test-token", id_token: "test-id", token_type: "Bearer", expires_in: 3600 },
      }),
      organizationMembershipRead: async (_token: string, orgId: string) => {
        const found = memberships[orgId] ?? { isExactMember: false, isOrganizationAdmin: false }
        return { success: true as const, data: found }
      },
    }

    const app = apiAppCreate({
      projectRepository,
      storageMigrationRepository: {} as any,
      assetApiRepository: {} as any,
      storage: {} as any,
      uploadApiRepository: {} as any,
      deletionApiRepository: {} as any,
      workflowApiRepository: {} as any,
      backupApiRepository: {} as any,
      catalogApiRepository: {} as any,
      catalogPublicationService: {} as any,
      auditApiRepository: {} as any,
      authentication: {
        config,
        stateStore,
        sessionStore,
        oidcClient: oidcClient as any,
        jwksClient,
        serviceBearer: undefined,
        sessionAccessTokenStore,
        now: () => nowSeconds * 1000,
      },
    })

    // Create David's initial JWT:
    // resourceowner: org-contentoren
    // grants on Contentoren project zit-c1
    const davidAccessToken = await tokenCreate(keys.privateKey, {
      iss: config.issuer,
      aud: [config.audience],
      sub: "david-subject-id",
      iat: nowSeconds - 60,
      exp: nowSeconds + 3600,
      "urn:zitadel:iam:org:id": "org-contentoren",
      "urn:zitadel:iam:user:resourceowner:id": "org-contentoren",
      assets_project_grants: {
        "zit-c1": ["assets.admin"],
      },
    })
    const davidAccessTokenReference = sessionAccessTokenStore.create(davidAccessToken, nowSeconds + 3600)
    if (!davidAccessTokenReference.success) throw new Error(davidAccessTokenReference.errorMessage)

    const initialSession: AuthenticationSession = {
      principal: {
        subjectId: "david-subject-id",
        displayName: "David",
        organizationId: "org-contentoren",
        mode: "admin",
        organizationAdmin: true,
        method: "human_session",
        grants: [{ projectId: "zit-c1", roles: ["admin"] }],
        issuedAt: nowSeconds - 60,
        expiresAt: nowSeconds + 3600,
      },
      createdAt: nowSeconds - 60,
      expiresAt: nowSeconds + 3600,
      rotateAt: nowSeconds + 900,
      identityOrganizationId: "org-contentoren",
      accessTokenReference: davidAccessTokenReference.data,
      identityGrants: [{ projectId: "zit-c1", roles: ["admin"] }],
    }

    const sessionCreated = await sessionStore.create(initialSession)
    if (!sessionCreated.success) throw new Error(sessionCreated.errorMessage)
    const initialCookie = sessionCookieCreate(sessionCreated.data, {
      name: config.sessionCookieName,
      maxAgeSeconds: 3600,
    })

    if (!contentorenCreated.success || !davidCreated.success || !fabianCreated.success) {
      throw new Error("Project creation failed")
    }

    return {
      app,
      config,
      sessionStore,
      sessionAccessTokenStore,
      initialCookie,
      memberships,
      keys,
      davidAccessToken,
      contentorenProjectId: contentorenCreated.data.project.project.id,
      davidProjectId: davidCreated.data.project.project.id,
      fabianProjectId: fabianCreated.data.project.project.id,
    }
  }

  test("GET /api/v1/auth/organizations returns live-verified configured organizations David belongs to with real names", async () => {
    const fixture = await setupFixture()

    const response = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organizations", {
        headers: { cookie: fixture.initialCookie },
      }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      ok: boolean
      data: {
        organizations: {
          id: string
          name: string
          slug?: string
          current: boolean
          mode: string
          organizationAdmin: boolean
        }[]
        currentOrganizationId: string
      }
    }
    expect(body.ok).toBe(true)
    expect(body.data.currentOrganizationId).toBe("org-contentoren")

    // Configured orgs: Contentoren, Fabian, David (and Fabian-Customers has no contributor grants so excluded)
    const orgIds = body.data.organizations.map((o) => o.id)
    expect(orgIds).toContain("org-contentoren")
    expect(orgIds).toContain("org-david")
    expect(orgIds).toContain("org-fabian")

    // Unconfigured / unauthorized orgs must NOT be included
    expect(orgIds).not.toContain("org-unauthorized")

    // Real names verified from Zitadel / DB
    const davidOrg = body.data.organizations.find((o) => o.id === "org-david")
    expect(davidOrg).toBeDefined()
    expect(davidOrg?.name).toBe("David")
    expect(davidOrg?.current).toBe(false)
    expect(davidOrg?.mode).toBe("admin")
    expect(davidOrg?.organizationAdmin).toBe(true)

    const contentorenOrg = body.data.organizations.find((o) => o.id === "org-contentoren")
    expect(contentorenOrg?.current).toBe(true)
    expect(contentorenOrg?.slug).toBe("contentoren")
  })

  test("POST /api/v1/auth/organization switches active organization session and updates access", async () => {
    const fixture = await setupFixture()

    // 1. Initial state: David is in Contentoren -> sees Contentoren project
    const initialProjects = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        headers: { cookie: fixture.initialCookie },
      }),
    )
    expect(initialProjects.status).toBe(200)
    const initialBody = (await initialProjects.json()) as { data: { projects: { id: string; slug: string }[] } }
    expect(initialBody.data.projects.map((p) => p.slug)).toEqual(["contentoren-main"])

    // 2. Switch to David org (POST /api/v1/auth/organization)
    const switchResponse = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          cookie: fixture.initialCookie,
          "content-type": "application/json",
          origin: "https://assets.example.test",
        },
        body: JSON.stringify({ organizationId: "org-david" }),
      }),
    )
    expect(switchResponse.status).toBe(200)
    const switchBody = (await switchResponse.json()) as {
      ok: boolean
      data: {
        switched: boolean
        organizationId: string
        principal: { organizationId: string; mode: string; organizationAdmin: boolean; grants: unknown[] }
      }
    }
    expect(switchBody.ok).toBe(true)
    expect(switchBody.data.switched).toBe(true)
    expect(switchBody.data.organizationId).toBe("org-david")
    expect(switchBody.data.principal.organizationId).toBe("org-david")
    expect(switchBody.data.principal.mode).toBe("admin")
    expect(switchBody.data.principal.organizationAdmin).toBe(true)
    expect(JSON.stringify(switchBody)).not.toContain("accessToken")
    expect(JSON.stringify(switchBody)).not.toContain("identityGrants")
    // Contentoren grants were cleared to prevent carrying elevated access
    expect(switchBody.data.principal.grants).toHaveLength(0)

    // Rotated session cookie was issued
    const newCookieHeader = switchResponse.headers.get("set-cookie")
    expect(newCookieHeader).toBeDefined()
    expect(newCookieHeader).toContain(fixture.config.sessionCookieName)

    const switchedCookie: string = newCookieHeader?.split(";")[0] ?? ""

    const oldSessionResponse = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        headers: { cookie: fixture.initialCookie },
      }),
    )
    expect(oldSessionResponse.status).toBe(401)

    // 3. GET /api/v1/auth/session with switched cookie reflects David org
    const sessionCheck = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/session", {
        headers: { cookie: switchedCookie },
      }),
    )
    expect(sessionCheck.status).toBe(200)
    const sessionBody = (await sessionCheck.json()) as { data: { principal: { organizationId: string } } }
    expect(sessionBody.data.principal.organizationId).toBe("org-david")

    // 4. GET /api/v1/projects now returns David projects, NOT Contentoren projects (tenant isolation!)
    const davidProjects = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        headers: { cookie: switchedCookie },
      }),
    )
    expect(davidProjects.status).toBe(200)
    const davidBody = (await davidProjects.json()) as { data: { projects: { id: string; slug: string }[] } }
    expect(davidBody.data.projects.map((p) => p.slug)).toEqual(["david-main"])

    // Owner org admin does not require a Zitadel project grant for owner org admin actions
    const davidSettings = await fixture.app.fetch(
      new Request(`https://assets.example.test/api/v1/projects/${fixture.davidProjectId}/settings`, {
        headers: { cookie: switchedCookie },
      }),
    )
    expect(davidSettings.status).toBe(200)

    // Cannot access Contentoren project while switched to David org
    const crossTenantSettings = await fixture.app.fetch(
      new Request(`https://assets.example.test/api/v1/projects/${fixture.contentorenProjectId}/settings`, {
        headers: { cookie: switchedCookie },
      }),
    )
    expect(crossTenantSettings.status).toBe(403)
  })

  test("POST /api/v1/auth/organization denies unknown and non-member organizations", async () => {
    const fixture = await setupFixture()

    // 1. Unknown / unconfigured organization
    const unknownResponse = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          cookie: fixture.initialCookie,
          "content-type": "application/json",
          origin: "https://assets.example.test",
        },
        body: JSON.stringify({ organizationId: "org-completely-unknown" }),
      }),
    )
    expect(unknownResponse.status).toBe(403)
    const unknownBody = (await unknownResponse.json()) as { error: { message: string } }
    expect(unknownBody.error.message).toBe("The organization was not allowed")

    // 2. Non-member organization
    fixture.memberships["org-fabian"] = { isExactMember: false, isOrganizationAdmin: false }
    const nonMemberResponse = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          cookie: fixture.initialCookie,
          "content-type": "application/json",
          origin: "https://assets.example.test",
        },
        body: JSON.stringify({ organizationId: "org-fabian" }),
      }),
    )
    expect(nonMemberResponse.status).toBe(403)
    const nonMemberBody = (await nonMemberResponse.json()) as { error: { message: string } }
    expect(nonMemberBody.error.message).toBe("The user is not a member of the requested organization")
  })

  test("keeps owner organization admin separate from ordinary membership", async () => {
    const fixture = await setupFixture()
    fixture.memberships["org-david"] = { isExactMember: true, isOrganizationAdmin: false, displayName: "David" }

    const response = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          cookie: fixture.initialCookie,
          "content-type": "application/json",
          origin: "https://assets.example.test",
        },
        body: JSON.stringify({ organizationId: "org-david" }),
      }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { principal: { organizationAdmin: boolean } } }
    expect(body.data.principal.organizationAdmin).toBe(false)
  })

  test("customer isolation: customer admin routes are denied even if identity has ORG_OWNER in Zitadel", async () => {
    const fixture = await setupFixture()

    // Create a customer session that has a valid contributor grant for a customer project
    const customerToken = await tokenCreate(fixture.keys.privateKey, {
      iss: fixture.config.issuer,
      aud: [fixture.config.audience],
      sub: "david-subject-id",
      iat: nowSeconds - 60,
      exp: nowSeconds + 3600,
      "urn:zitadel:iam:org:id": "org-contentoren",
      "urn:zitadel:iam:user:resourceowner:id": "org-contentoren",
      assets_project_grants: {
        "org-fabian-customers": { "zit-c1": ["assets.uploader"] },
      },
    })
    const customerTokenReference = fixture.sessionAccessTokenStore.create(customerToken, nowSeconds + 3600)
    if (!customerTokenReference.success) throw new Error(customerTokenReference.errorMessage)

    const customerSession: AuthenticationSession = {
      principal: {
        subjectId: "david-subject-id",
        displayName: "David",
        organizationId: "org-contentoren",
        mode: "admin",
        organizationAdmin: true,
        method: "human_session",
        grants: [{ projectId: "zit-c1", roles: ["admin"] }],
        issuedAt: nowSeconds - 60,
        expiresAt: nowSeconds + 3600,
      },
      createdAt: nowSeconds - 60,
      expiresAt: nowSeconds + 3600,
      rotateAt: nowSeconds + 900,
      identityOrganizationId: "org-contentoren",
      accessTokenReference: customerTokenReference.data,
      identityGrants: [{ projectId: "zit-c1", roles: ["admin"] }],
    }

    const created = await fixture.sessionStore.create(customerSession)
    if (!created.success) throw new Error(created.errorMessage)
    const cookie = sessionCookieCreate(created.data, {
      name: fixture.config.sessionCookieName,
      maxAgeSeconds: 3600,
    })

    // Attempting to switch to customer org without contributor grants for that customer org is rejected
    const custSwitch = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
          origin: "https://assets.example.test",
        },
        body: JSON.stringify({ organizationId: "org-fabian-customers" }),
      }),
    )
    expect(custSwitch.status).toBe(403)
  })

  test("original token identity is preserved across repeated switches and permits safe return to original org", async () => {
    const fixture = await setupFixture()

    // 1. Initial: Contentoren (has grant zit-c1: admin)
    // Switch 1: Contentoren -> David
    const toDavid = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          cookie: fixture.initialCookie,
          "content-type": "application/json",
          origin: "https://assets.example.test",
        },
        body: JSON.stringify({ organizationId: "org-david" }),
      }),
    )
    expect(toDavid.status).toBe(200)
    const davidCookie: string = toDavid.headers.get("set-cookie")?.split(";")[0] ?? ""

    // Switch 2: David -> Fabian
    const toFabian = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          cookie: davidCookie,
          "content-type": "application/json",
          origin: "https://assets.example.test",
        },
        body: JSON.stringify({ organizationId: "org-fabian" }),
      }),
    )
    expect(toFabian.status).toBe(200)
    const toFabianBody = (await toFabian.json()) as {
      data: { organizationId: string; principal: { grants: unknown[] } }
    }
    expect(toFabianBody.data.organizationId).toBe("org-fabian")
    expect(toFabianBody.data.principal.grants).toHaveLength(0) // grants still cleared
    const fabianCookie: string = toFabian.headers.get("set-cookie")?.split(";")[0] ?? ""

    // Switch 3: Fabian -> Safe return to original org Contentoren!
    const returnToContentoren = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          cookie: fabianCookie,
          "content-type": "application/json",
          origin: "https://assets.example.test",
        },
        body: JSON.stringify({ organizationId: "org-contentoren" }),
      }),
    )
    expect(returnToContentoren.status).toBe(200)
    const returnBody = (await returnToContentoren.json()) as {
      data: {
        organizationId: string
        principal: {
          organizationId: string
          mode: string
          organizationAdmin: boolean
          grants: { projectId: string; roles: string[] }[]
        }
      }
    }
    expect(returnBody.data.organizationId).toBe("org-contentoren")
    expect(returnBody.data.principal.organizationId).toBe("org-contentoren")
    expect(returnBody.data.principal.mode).toBe("admin")
    expect(returnBody.data.principal.organizationAdmin).toBe(true)
    // Contentoren grants were safely restored!
    expect(returnBody.data.principal.grants).toEqual([{ projectId: "zit-c1", roles: ["admin"] }])

    // Switch 4: Back to David again (repeated switch works!)
    const contentorenCookie: string = returnToContentoren.headers.get("set-cookie")?.split(";")[0] ?? ""
    const backToDavid = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          cookie: contentorenCookie,
          "content-type": "application/json",
          origin: "https://assets.example.test",
        },
        body: JSON.stringify({ organizationId: "org-david" }),
      }),
    )
    expect(backToDavid.status).toBe(200)
  })

  test("enforces session cookie CSRF/origin handling, method-not-allowed, and denies bearer authentication", async () => {
    const fixture = await setupFixture()

    // 1. Cross-origin attack via Origin header -> 403 Forbidden
    const evilOrigin = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          cookie: fixture.initialCookie,
          "content-type": "application/json",
          origin: "https://evil-attacker.example.com",
        },
        body: JSON.stringify({ organizationId: "org-david" }),
      }),
    )
    expect(evilOrigin.status).toBe(403)
    const evilBody = (await evilOrigin.json()) as { error: { message: string } }
    expect(evilBody.error.message).toBe("Cross-origin request forbidden")

    // 2. Cross-site request via Sec-Fetch-Site -> 403 Forbidden
    const crossSite = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          cookie: fixture.initialCookie,
          "content-type": "application/json",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({ organizationId: "org-david" }),
      }),
    )
    expect(crossSite.status).toBe(403)

    // 2b. Cookie-authenticated state changes require an explicit same-origin Origin.
    const missingOrigin = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          cookie: fixture.initialCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ organizationId: "org-david" }),
      }),
    )
    expect(missingOrigin.status).toBe(403)

    // 3. Service account bearer token on organization switch -> 403 Forbidden
    const bearerSwitch = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          authorization: "Bearer some-service-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ organizationId: "org-david" }),
      }),
    )
    expect(bearerSwitch.status).toBe(403)

    // 4. Unauthenticated request (no cookie) -> 401 Unauthorized
    const unauthenticated = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId: "org-david" }),
      }),
    )
    expect(unauthenticated.status).toBe(401)

    // 5. Invalid request body -> 400 Validation Failed
    const invalidBody = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "POST",
        headers: {
          cookie: fixture.initialCookie,
          "content-type": "application/json",
          origin: "https://assets.example.test",
        },
        body: JSON.stringify({ organizationId: "" }),
      }),
    )
    expect(invalidBody.status).toBe(400)

    // 6. Method Not Allowed (405)
    const wrongMethodGet = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organization", {
        method: "GET",
      }),
    )
    expect(wrongMethodGet.status).toBe(405)
    expect(wrongMethodGet.headers.get("allow")).toContain("POST")

    const wrongMethodPost = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/organizations", {
        method: "POST",
      }),
    )
    expect(wrongMethodPost.status).toBe(405)
    expect(wrongMethodPost.headers.get("allow")).toContain("GET")
  })
})
