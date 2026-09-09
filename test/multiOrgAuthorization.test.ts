import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import * as v from "valibot"

import { apiAppCreate } from "../src/api/apiAppCreate.js"
import { humanLoginCallback } from "../src/authentication/humanLoginCallback.js"
import { jwtPrincipalValidate } from "../src/authentication/jwtPrincipalValidate.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { projectAuthorizationCheck } from "../src/authentication/projectAuthorizationCheck.js"
import { serviceBearerValidate } from "../src/authentication/serviceBearerValidate.js"
import { servicePatPrincipalValidate } from "../src/authentication/servicePatPrincipalValidate.js"
import type { AuthenticatedPrincipal } from "../src/authentication/authenticatedPrincipalSchema.js"
import type { ZitadelAuthConfig } from "../src/authentication/zitadelAuthConfigSchema.js"
import { zitadelOrganizationContextCreate } from "../src/authentication/zitadelOrganizationContextCreate.js"
import { zitadelOrganizationMappingsParse } from "../src/config/zitadelOrganizationMappingsParse.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { projectBindingTable } from "../src/infrastructure/db/schema/projectBindingTable.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import type { ZitadelJwk } from "../src/infrastructure/zitadel/zitadelJwk.js"
import { zitadelJwksClientMemoryCreate } from "../src/infrastructure/zitadel/zitadelJwksClientMemoryCreate.js"
import type { ProjectBinding } from "../src/project/projectBindingSchema.js"
import { projectRepositoryCreate } from "../src/project/projectRepositoryCreate.js"
import type { ProjectListItem } from "../src/api-client/projectListItemSchema.js"

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
  projectId: "zitadel-project-1",
  sessionCookieName: "assets_session",
  stateCookieName: "assets_state",
  sessionTtlSeconds: 3600,
  sessionRotationSeconds: 60,
  clockSkewSeconds: 0,
  jwksCacheTtlSeconds: 60,
}

describe("Multi-organization context and mappings", () => {
  test("resolves owners and customers correctly across Contentoren, Fabian, and David", () => {
    const orgContext = zitadelOrganizationContextCreate(multiOrgMappings)
    expect(orgContext.ownerOrganizationIds).toEqual(["org-contentoren", "org-fabian", "org-david"])
    expect(orgContext.customerOrganizationIds).toEqual(["org-contentoren-customers", "org-fabian-customers"])
    expect(orgContext.allowedOrganizationIds).toEqual([
      "org-contentoren",
      "org-fabian",
      "org-david",
      "org-contentoren-customers",
      "org-fabian-customers",
    ])

    expect(orgContext.isOwner("org-contentoren")).toBe(true)
    expect(orgContext.isOwner("org-fabian")).toBe(true)
    expect(orgContext.isOwner("org-david")).toBe(true)
    expect(orgContext.isOwner("org-fabian-customers")).toBe(false)
    expect(orgContext.isOwner("org-unknown")).toBe(false)

    expect(orgContext.isCustomer("org-contentoren-customers")).toBe(true)
    expect(orgContext.isCustomer("org-fabian-customers")).toBe(true)
    expect(orgContext.isCustomer("org-david")).toBe(false)
    expect(orgContext.isCustomer("org-unknown")).toBe(false)

    expect(orgContext.ownerForCustomerRead("org-fabian-customers")).toBe("org-fabian")
    expect(orgContext.ownerForCustomerRead("org-contentoren-customers")).toBe("org-contentoren")
    expect(orgContext.ownerForCustomerRead("org-david")).toBeNull()

    expect(orgContext.customerForOwnerRead("org-fabian")).toBe("org-fabian-customers")
    expect(orgContext.customerForOwnerRead("org-contentoren")).toBe("org-contentoren-customers")
    expect(orgContext.customerForOwnerRead("org-david")).toBeNull()
  })

  test("parses both JSON array and JSON record configurations", () => {
    const fromArray = zitadelOrganizationMappingsParse(JSON.stringify(multiOrgMappings))
    expect(fromArray.success).toBe(true)
    if (!fromArray.success) return
    expect(fromArray.data).toEqual(multiOrgMappings)

    const fromRecord = zitadelOrganizationMappingsParse(
      JSON.stringify({
        "org-contentoren": "org-contentoren-customers",
        "org-fabian": "org-fabian-customers",
        "org-david": null,
      }),
    )
    expect(fromRecord.success).toBe(true)
    if (!fromRecord.success) return
    expect(fromRecord.data).toEqual(multiOrgMappings)
  })
})

describe("Multi-organization JWT Principal Validation", () => {
  test("authenticates human sessions for Contentoren, Fabian, Fabian-Customers, and David", async () => {
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const jwksClient = zitadelJwksClientMemoryCreate([jwk])
    const orgContext = zitadelOrganizationContextCreate(multiOrgMappings)

    const validateFor = async (orgId: string, resourceOwnerId: string) => {
      const token = await tokenCreate(keys.privateKey, {
        iss: config.issuer,
        aud: [config.audience],
        sub: `user-${orgId}`,
        iat: nowSeconds - 60,
        exp: nowSeconds + 600,
        "urn:zitadel:iam:org:id": orgId,
        "urn:zitadel:iam:user:resourceowner:id": resourceOwnerId,
        assets_project_grants: { "zitadel-proj-1": ["assets.uploader"] },
      })
      return jwtPrincipalValidate(token, {
        issuer: config.issuer,
        audience: config.audience,
        jwksUri: "https://zitadel.example.test/oauth/v2/keys",
        jwksClient,
        organizationId: config.organizationId,
        customerOrganizationId: config.customerOrganizationId,
        ownerOrganizationIds: orgContext.ownerOrganizationIds,
        customerOrganizationIds: orgContext.customerOrganizationIds,
        allowedOrganizationIds: orgContext.allowedOrganizationIds,
        method: "human_session",
        now: () => nowSeconds * 1000,
      })
    }

    // Contentoren owner -> admin mode
    const contentoren = await validateFor("org-contentoren", "org-contentoren")
    expect(contentoren.success).toBe(true)
    if (contentoren.success) {
      expect(contentoren.data.organizationId).toBe("org-contentoren")
      expect(contentoren.data.mode).toBe("admin")
    }

    // Fabian owner -> admin mode
    const fabian = await validateFor("org-fabian", "org-fabian")
    expect(fabian.success).toBe(true)
    if (fabian.success) {
      expect(fabian.data.organizationId).toBe("org-fabian")
      expect(fabian.data.mode).toBe("admin")
    }

    // David owner -> admin mode
    const david = await validateFor("org-david", "org-david")
    expect(david.success).toBe(true)
    if (david.success) {
      expect(david.data.organizationId).toBe("org-david")
      expect(david.data.mode).toBe("admin")
    }

    // Fabian customer -> contributor mode
    const fabianCustomer = await validateFor("org-fabian-customers", "org-fabian-customers")
    expect(fabianCustomer.success).toBe(true)
    if (fabianCustomer.success) {
      expect(fabianCustomer.data.organizationId).toBe("org-fabian-customers")
      expect(fabianCustomer.data.mode).toBe("contributor")
    }

    // Contentoren customer -> contributor mode
    const contentorenCustomer = await validateFor("org-contentoren-customers", "org-contentoren-customers")
    expect(contentorenCustomer.success).toBe(true)
    if (contentorenCustomer.success) {
      expect(contentorenCustomer.data.organizationId).toBe("org-contentoren-customers")
      expect(contentorenCustomer.data.mode).toBe("contributor")
    }

    // Unconfigured org -> rejected
    const unconfigured = await validateFor("org-unrelated", "org-unrelated")
    expect(unconfigured.success).toBe(false)

    // Impersonation attempt: Customer claims to be Fabian owner -> rejected
    const impersonator = await validateFor("org-fabian", "org-fabian-customers")
    expect(impersonator.success).toBe(false)

    // Impersonation attempt: Contentoren claims to be David -> rejected
    const davidImpersonator = await validateFor("org-david", "org-contentoren")
    expect(davidImpersonator.success).toBe(false)
  })

  test("authenticates service bearer tokens for each owner organization", async () => {
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const jwksClient = zitadelJwksClientMemoryCreate([jwk])
    const orgContext = zitadelOrganizationContextCreate(multiOrgMappings)

    const validateServiceBearer = async (orgId: string) => {
      const token = await tokenCreate(keys.privateKey, {
        iss: config.issuer,
        aud: [config.audience],
        sub: `service-${orgId}`,
        iat: nowSeconds - 60,
        exp: nowSeconds + 600,
        "urn:zitadel:iam:org:id": orgId,
        client_id: "service-client-1",
        assets_project_grants: { "zitadel-proj-1": ["admin"] },
      })
      return serviceBearerValidate(
        new Request("https://assets.example.test", { headers: { authorization: `Bearer ${token}` } }),
        {
          issuer: config.issuer,
          audience: config.audience,
          jwksUri: "https://zitadel.example.test/oauth/v2/keys",
          jwksClient,
          organizationId: config.organizationId,
          allowedOrganizationIds: orgContext.ownerOrganizationIds,
          ownerOrganizationIds: orgContext.ownerOrganizationIds,
          customerOrganizationIds: orgContext.customerOrganizationIds,
          serviceAccountClientId: "service-client-1",
          now: () => nowSeconds * 1000,
        },
      )
    }

    const contentorenService = await validateServiceBearer("org-contentoren")
    expect(contentorenService.success).toBe(true)
    if (contentorenService.success) expect(contentorenService.data.organizationId).toBe("org-contentoren")

    const fabianService = await validateServiceBearer("org-fabian")
    expect(fabianService.success).toBe(true)
    if (fabianService.success) expect(fabianService.data.organizationId).toBe("org-fabian")

    const davidService = await validateServiceBearer("org-david")
    expect(davidService.success).toBe(true)
    if (davidService.success) expect(davidService.data.organizationId).toBe("org-david")

    const unconfiguredService = await validateServiceBearer("org-other")
    expect(unconfiguredService.success).toBe(false)
  })
})

describe("Multi-organization Personal Access Tokens (PAT)", () => {
  test("validates PAT for each allowed owner organization and isolates unauthorized orgs", async () => {
    const orgContext = zitadelOrganizationContextCreate(multiOrgMappings)

    const patValidate = async (resourceOwner: string) =>
      servicePatPrincipalValidate("test-pat-token", {
        issuer: config.issuer,
        organizationId: config.organizationId,
        allowedOrganizationIds: orgContext.ownerOrganizationIds,
        fetcher: async (input) => {
          const url = String(input)
          if (url.endsWith("/auth/v1/users/me")) {
            return new Response(
              JSON.stringify({
                user: { id: "user-1", state: "USER_STATE_ACTIVE", machine: {}, details: { resourceOwner } },
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            )
          }
          if (url.endsWith("/auth/v1/usergrants/me/_search")) {
            return new Response(
              JSON.stringify({
                result: [
                  {
                    projectId: "proj-1",
                    state: "USER_GRANT_STATE_ACTIVE",
                    orgId: resourceOwner,
                    roleKeys: ["assets.admin"],
                  },
                ],
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            )
          }
          return new Response("Not found", { status: 404 })
        },
      })

    const fabianPat = await patValidate("org-fabian")
    expect(fabianPat.success).toBe(true)
    if (fabianPat.success) expect(fabianPat.data.organizationId).toBe("org-fabian")

    const davidPat = await patValidate("org-david")
    expect(davidPat.success).toBe(true)
    if (davidPat.success) expect(davidPat.data.organizationId).toBe("org-david")

    const contentorenPat = await patValidate("org-contentoren")
    expect(contentorenPat.success).toBe(true)
    if (contentorenPat.success) expect(contentorenPat.data.organizationId).toBe("org-contentoren")

    const unauthorizedPat = await patValidate("org-unauthorized")
    expect(unauthorizedPat.success).toBe(false)
  })
})

describe("Multi-organization Human Login Callback", () => {
  test("issues admin session for Fabian and customer contributor session for Fabian-Customers", async () => {
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const jwksClient = zitadelJwksClientMemoryCreate([jwk])
    const stateStore = memoryPkceStateStoreCreate()
    const sessionStore = memorySessionStoreCreate()

    const runCallback = async (orgId: string, isCustomer: boolean, isExactMember = true) => {
      const stateStore = memoryPkceStateStoreCreate({ now: () => nowSeconds * 1000 })
      const sessionStore = memorySessionStoreCreate()
      const accessToken = await tokenCreate(keys.privateKey, {
        iss: config.issuer,
        aud: [config.audience],
        sub: `user-${orgId}`,
        iat: nowSeconds - 60,
        exp: nowSeconds + 600,
        "urn:zitadel:iam:org:id": orgId,
        "urn:zitadel:iam:user:resourceowner:id": orgId,
        assets_project_grants: { "zitadel-proj-1": isCustomer ? ["assets.uploader"] : ["assets.admin"] },
      })
      const idToken = await tokenCreate(keys.privateKey, {
        iss: config.issuer,
        aud: [config.clientId],
        sub: `user-${orgId}`,
        iat: nowSeconds - 60,
        exp: nowSeconds + 600,
        name: `User ${orgId}`,
        nonce: "test-nonce",
      })
      await stateStore.save("test-state", {
        codeVerifier: "test-verifier",
        nonce: "test-nonce",
        returnTo: "/projects",
        createdAt: nowSeconds,
        expiresAt: nowSeconds + 600,
      })

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
          data: { access_token: accessToken, id_token: idToken, token_type: "Bearer", expires_in: 3600 },
        }),
        organizationMembershipRead: async () => ({
          success: true as const,
          data: { isExactMember, isOrganizationAdmin: false, diagnostics: undefined },
        }),
      }

      return humanLoginCallback({ code: "test-code", state: "test-state" }, "test-state", {
        config,
        stateStore,
        sessionStore,
        oidcClient,
        jwksClient,
        now: () => nowSeconds * 1000,
      })
    }

    // Fabian owner login
    const fabianLogin = await runCallback("org-fabian", false)
    expect(fabianLogin.success).toBe(true)
    if (fabianLogin.success) {
      expect(fabianLogin.data.principal.organizationId).toBe("org-fabian")
      expect(fabianLogin.data.principal.mode).toBe("admin")
      expect(fabianLogin.data.principal.organizationAdmin).toBe(true)
    }

    // Fabian customer login with exact membership verified
    const customerLogin = await runCallback("org-fabian-customers", true, true)
    expect(customerLogin.success).toBe(true)
    if (customerLogin.success) {
      expect(customerLogin.data.principal.organizationId).toBe("org-fabian-customers")
      expect(customerLogin.data.principal.mode).toBe("contributor")
      expect(customerLogin.data.principal.organizationAdmin).toBe(false)
      expect(customerLogin.data.principal.grants).toEqual([{ projectId: "zitadel-proj-1", roles: ["contributor"] }])
    }

    // Fabian customer without exact membership -> rejected
    const nonMemberCustomer = await runCallback("org-fabian-customers", true, false)
    expect(nonMemberCustomer.success).toBe(false)
    if (!nonMemberCustomer.success) {
      expect(nonMemberCustomer.errorMessage).toBe("The exact organization membership was missing")
    }

    // David owner login
    const davidLogin = await runCallback("org-david", false)
    expect(davidLogin.success).toBe(true)
    if (davidLogin.success) {
      expect(davidLogin.data.principal.organizationId).toBe("org-david")
      expect(davidLogin.data.principal.mode).toBe("admin")
      expect(davidLogin.data.principal.organizationAdmin).toBe(true)
    }

    // Unknown organization login -> rejected
    const unknownLogin = await runCallback("org-unknown", false)
    expect(unknownLogin.success).toBe(false)
  })
})

describe("Multi-organization Project Route Authorization", () => {
  const fabianBinding: ProjectBinding = {
    id: "binding-fabian",
    projectId: "proj-fabian",
    organizationId: "org-fabian",
    zitadelProjectId: "zitadel-fabian-1",
    serviceProjectId: "service-fabian-1",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  }

  const davidBinding: ProjectBinding = {
    id: "binding-david",
    projectId: "proj-david",
    organizationId: "org-david",
    zitadelProjectId: "zitadel-david-1",
    serviceProjectId: "service-david-1",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  }

  const contentorenBinding: ProjectBinding = {
    id: "binding-contentoren",
    projectId: "proj-contentoren",
    organizationId: "org-contentoren",
    zitadelProjectId: "zitadel-contentoren-1",
    serviceProjectId: "service-contentoren-1",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  }

  const principalCreate = (
    organizationId: string,
    mode: "admin" | "contributor",
    organizationAdmin: boolean,
    grants: { projectId: string; roles: ("admin" | "contributor")[] }[],
  ): AuthenticatedPrincipal => ({
    subjectId: `user-${organizationId}`,
    organizationId,
    mode,
    organizationAdmin,
    method: "human_session",
    grants,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + 3600,
  })

  test("enforces tenant isolation and owner/customer roles for Fabian projects", () => {
    const fabianAdmin = principalCreate("org-fabian", "admin", true, [])
    const fabianCustomerContributor = principalCreate("org-fabian-customers", "contributor", false, [
      { projectId: "zitadel-fabian-1", roles: ["contributor"] },
    ])
    const contentorenAdmin = principalCreate("org-contentoren", "admin", true, [])
    const contentorenCustomer = principalCreate("org-contentoren-customers", "contributor", false, [
      { projectId: "zitadel-fabian-1", roles: ["contributor"] },
    ])
    const davidAdmin = principalCreate("org-david", "admin", true, [])

    const scope = { organizationMappings: multiOrgMappings }

    // Fabian admin has admin and contributor access
    expect(
      projectAuthorizationCheck(fabianAdmin, fabianBinding, "admin", "service-fabian-1", undefined, scope).success,
    ).toBe(true)
    expect(
      projectAuthorizationCheck(fabianAdmin, fabianBinding, "contributor", "service-fabian-1", undefined, scope)
        .success,
    ).toBe(true)

    // Fabian customer has contributor access, but admin is forbidden
    expect(
      projectAuthorizationCheck(
        fabianCustomerContributor,
        fabianBinding,
        "contributor",
        "service-fabian-1",
        undefined,
        scope,
      ).success,
    ).toBe(true)
    const adminDenied = projectAuthorizationCheck(
      fabianCustomerContributor,
      fabianBinding,
      "admin",
      "service-fabian-1",
      undefined,
      scope,
    )
    expect(adminDenied.success).toBe(false)
    if (!adminDenied.success) expect(adminDenied.errorMessage).toBe("The admin role was required")

    // Contentoren admin CANNOT access Fabian project (tenant isolation)
    const crossTenantContentoren = projectAuthorizationCheck(
      contentorenAdmin,
      fabianBinding,
      "contributor",
      "service-fabian-1",
      undefined,
      scope,
    )
    expect(crossTenantContentoren.success).toBe(false)
    if (!crossTenantContentoren.success) {
      expect(crossTenantContentoren.errorMessage).toBe("The organization grant was invalid")
    }

    // Contentoren customer CANNOT access Fabian project even if granted zitadel projectId
    const crossTenantCustomer = projectAuthorizationCheck(
      contentorenCustomer,
      fabianBinding,
      "contributor",
      "service-fabian-1",
      undefined,
      scope,
    )
    expect(crossTenantCustomer.success).toBe(false)
    if (!crossTenantCustomer.success) {
      expect(crossTenantCustomer.errorMessage).toBe("The organization grant was invalid")
    }

    // David admin CANNOT access Fabian project
    const crossTenantDavid = projectAuthorizationCheck(
      davidAdmin,
      fabianBinding,
      "contributor",
      "service-fabian-1",
      undefined,
      scope,
    )
    expect(crossTenantDavid.success).toBe(false)
    if (!crossTenantDavid.success) {
      expect(crossTenantDavid.errorMessage).toBe("The organization grant was invalid")
    }
  })

  test("enforces tenant isolation and prevents any customer access for David projects", () => {
    const davidAdmin = principalCreate("org-david", "admin", true, [])
    const fabianCustomer = principalCreate("org-fabian-customers", "contributor", false, [
      { projectId: "zitadel-david-1", roles: ["contributor"] },
    ])
    const contentorenCustomer = principalCreate("org-contentoren-customers", "contributor", false, [
      { projectId: "zitadel-david-1", roles: ["contributor"] },
    ])
    const fabianAdmin = principalCreate("org-fabian", "admin", true, [])

    const scope = { organizationMappings: multiOrgMappings }

    // David admin is authorized
    expect(
      projectAuthorizationCheck(davidAdmin, davidBinding, "admin", "service-david-1", undefined, scope).success,
    ).toBe(true)

    // No customer organization is mapped to David -> all customer access denied
    const fabianCustomerOnDavid = projectAuthorizationCheck(
      fabianCustomer,
      davidBinding,
      "contributor",
      "service-david-1",
      undefined,
      scope,
    )
    expect(fabianCustomerOnDavid.success).toBe(false)
    if (!fabianCustomerOnDavid.success) {
      expect(fabianCustomerOnDavid.errorMessage).toBe("The organization grant was invalid")
    }

    const contentorenCustomerOnDavid = projectAuthorizationCheck(
      contentorenCustomer,
      davidBinding,
      "contributor",
      "service-david-1",
      undefined,
      scope,
    )
    expect(contentorenCustomerOnDavid.success).toBe(false)
    if (!contentorenCustomerOnDavid.success) {
      expect(contentorenCustomerOnDavid.errorMessage).toBe("The organization grant was invalid")
    }

    // Other owner admin denied
    const fabianOnDavid = projectAuthorizationCheck(
      fabianAdmin,
      davidBinding,
      "contributor",
      "service-david-1",
      undefined,
      scope,
    )
    expect(fabianOnDavid.success).toBe(false)
  })

  test("enforces tenant isolation for Contentoren projects against Fabian and David", () => {
    const contentorenAdmin = principalCreate("org-contentoren", "admin", true, [])
    const contentorenCustomer = principalCreate("org-contentoren-customers", "contributor", false, [
      { projectId: "zitadel-contentoren-1", roles: ["contributor"] },
    ])
    const fabianAdmin = principalCreate("org-fabian", "admin", true, [])
    const fabianCustomer = principalCreate("org-fabian-customers", "contributor", false, [
      { projectId: "zitadel-contentoren-1", roles: ["contributor"] },
    ])

    const scope = { organizationMappings: multiOrgMappings }

    expect(
      projectAuthorizationCheck(
        contentorenAdmin,
        contentorenBinding,
        "admin",
        "service-contentoren-1",
        undefined,
        scope,
      ).success,
    ).toBe(true)
    expect(
      projectAuthorizationCheck(
        contentorenCustomer,
        contentorenBinding,
        "contributor",
        "service-contentoren-1",
        undefined,
        scope,
      ).success,
    ).toBe(true)

    const fabianOnContentoren = projectAuthorizationCheck(
      fabianAdmin,
      contentorenBinding,
      "contributor",
      "service-contentoren-1",
      undefined,
      scope,
    )
    expect(fabianOnContentoren.success).toBe(false)

    const fabianCustomerOnContentoren = projectAuthorizationCheck(
      fabianCustomer,
      contentorenBinding,
      "contributor",
      "service-contentoren-1",
      undefined,
      scope,
    )
    expect(fabianCustomerOnContentoren.success).toBe(false)
  })
})

describe("Multi-organization Project Listing (/api/v1/projects)", () => {
  const projectListItemCreate = (id: string, organizationId: string): ProjectListItem => ({
    id,
    organizationId,
    name: `Project ${id}`,
    slug: `project-${id}`,
    defaultEnvironment: "development",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
    assetCount: 1,
    totalFileSize: 100,
  })

  const allProjects: ProjectListItem[] = [
    projectListItemCreate("proj-c1", "org-contentoren"),
    projectListItemCreate("proj-c2", "org-contentoren"),
    projectListItemCreate("proj-f1", "org-fabian"),
    projectListItemCreate("proj-f2", "org-fabian"),
    projectListItemCreate("proj-d1", "org-david"),
  ]

  const projectRepositoryMock = {
    projectsRead: (organizationId: string, zitadelProjectIds: readonly string[], organizationAdmin = false) => {
      let matching = allProjects.filter((p) => p.organizationId === organizationId)
      if (!organizationAdmin) {
        matching = matching.filter((p) => zitadelProjectIds.includes(`zitadel-${p.id}`))
      }
      return { success: true as const, data: matching }
    },
    projectRead: () => ({ success: true as const, data: null }),
    projectBindingRead: () => ({ success: true as const, data: null }),
    environmentsRead: () => ({ success: true as const, data: [] }),
    projectCreate: () => ({ success: false as const, op: "mock", errorMessage: "mock" }),
    projectSettingsUpdate: () => ({ success: false as const, op: "mock", errorMessage: "mock" }),
  }

  const appCreateForPrincipal = async (principal: AuthenticatedPrincipal) => {
    const sessionStore = memorySessionStoreCreate()
    const stateStore = memoryPkceStateStoreCreate({ now: () => nowSeconds * 1000 })
    const sessionPolicyVersion = sessionStore.sessionPolicyVersionRead()
    const session = await sessionStore.create({
      principal,
      createdAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
      rotateAt: nowSeconds + 3600,
      sessionPolicyVersion: sessionPolicyVersion.success ? sessionPolicyVersion.data : 2,
    })
    const app = apiAppCreate({
      projectRepository: projectRepositoryMock as any,
      storageMigrationRepository: {} as any,
      storageMigrationWorkflowEnqueue: () => ({
        success: true as const,
        data: { migrationId: "m1", workflowId: "w1" },
      }),
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
        oidcClient: {} as any,
        jwksClient: {} as any,
        serviceBearer: undefined,
        now: () => nowSeconds * 1000,
      },
    })
    return {
      fetch: (url: string) =>
        app.fetch(
          new Request(url, {
            headers: {
              cookie: `${config.sessionCookieName}=${session.success ? session.data : ""}`,
            },
          }),
        ),
    }
  }

  test("Contentoren admin sees only Contentoren projects", async () => {
    const principal: AuthenticatedPrincipal = {
      subjectId: "user-contentoren",
      organizationId: "org-contentoren",
      mode: "admin",
      organizationAdmin: true,
      method: "human_session",
      grants: [],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    }
    const app = await appCreateForPrincipal(principal)
    const response = await app.fetch("https://assets.example.test/api/v1/projects")
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { projects: ProjectListItem[] } }
    expect(body.data.projects.map((p) => p.id)).toEqual(["proj-c1", "proj-c2"])
  })

  test("Fabian admin sees only Fabian projects", async () => {
    const principal: AuthenticatedPrincipal = {
      subjectId: "user-fabian",
      organizationId: "org-fabian",
      mode: "admin",
      organizationAdmin: true,
      method: "human_session",
      grants: [],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    }
    const app = await appCreateForPrincipal(principal)
    const response = await app.fetch("https://assets.example.test/api/v1/projects")
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { projects: ProjectListItem[] } }
    expect(body.data.projects.map((p) => p.id)).toEqual(["proj-f1", "proj-f2"])
  })

  test("David admin sees only David projects", async () => {
    const principal: AuthenticatedPrincipal = {
      subjectId: "user-david",
      organizationId: "org-david",
      mode: "admin",
      organizationAdmin: true,
      method: "human_session",
      grants: [],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    }
    const app = await appCreateForPrincipal(principal)
    const response = await app.fetch("https://assets.example.test/api/v1/projects")
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { projects: ProjectListItem[] } }
    expect(body.data.projects.map((p) => p.id)).toEqual(["proj-d1"])
  })

  test("Fabian-Customers contributor sees only their granted Fabian projects", async () => {
    const principal: AuthenticatedPrincipal = {
      subjectId: "user-fabian-customer",
      organizationId: "org-fabian-customers",
      mode: "contributor",
      organizationAdmin: false,
      method: "human_session",
      grants: [{ projectId: "zitadel-proj-f1", roles: ["contributor"] }],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    }
    const app = await appCreateForPrincipal(principal)
    const response = await app.fetch("https://assets.example.test/api/v1/projects")
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { projects: ProjectListItem[] } }
    expect(body.data.projects.map((p) => p.id)).toEqual(["proj-f1"])
  })

  test("Contentoren-Customers contributor sees only their granted Contentoren projects", async () => {
    const principal: AuthenticatedPrincipal = {
      subjectId: "user-contentoren-customer",
      organizationId: "org-contentoren-customers",
      mode: "contributor",
      organizationAdmin: false,
      method: "human_session",
      grants: [{ projectId: "zitadel-proj-c2", roles: ["contributor"] }],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    }
    const app = await appCreateForPrincipal(principal)
    const response = await app.fetch("https://assets.example.test/api/v1/projects")
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { projects: ProjectListItem[] } }
    expect(body.data.projects.map((p) => p.id)).toEqual(["proj-c2"])
  })
})

describe("Multi-organization Actual API Auth Login Flow (/api/v1/auth/login, /api/v1/auth/callback, /api/v1/auth/session)", () => {
  const loginTestSetup = async () => {
    const keys = await keyPairCreate()
    const jwk = await jwkCreate(keys.publicKey)
    const jwksClient = zitadelJwksClientMemoryCreate([jwk])
    const sessionStore = memorySessionStoreCreate()
    const stateStore = memoryPkceStateStoreCreate({ now: () => nowSeconds * 1000 })

    let tokenPayloadsForCode: Record<string, { orgId: string; resourceOwnerId: string; isCustomer: boolean }> = {}
    let exactMembershipByOrg: Record<string, boolean> = {}

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
      authorizationUrlCreate: async (params: { state: string }) => ({
        success: true as const,
        data: `https://zitadel.example.test/oauth/v2/authorize?state=${params.state}`,
      }),
      authorizationCodeExchange: async (code: string) => {
        const entry = tokenPayloadsForCode[code]
        if (!entry) throw new Error(`Unknown test code: ${code}`)
        const accessToken = await tokenCreate(keys.privateKey, {
          iss: config.issuer,
          aud: [config.audience],
          sub: `user-${entry.orgId}`,
          iat: nowSeconds - 60,
          exp: nowSeconds + 600,
          "urn:zitadel:iam:org:id": entry.orgId,
          "urn:zitadel:iam:user:resourceowner:id": entry.resourceOwnerId,
          assets_project_grants: {
            "zitadel-proj-1": entry.isCustomer ? ["assets.uploader"] : ["assets.admin"],
          },
        })
        const idToken = await tokenCreate(keys.privateKey, {
          iss: config.issuer,
          aud: [config.clientId],
          sub: `user-${entry.orgId}`,
          iat: nowSeconds - 60,
          exp: nowSeconds + 600,
          name: `User ${entry.orgId}`,
          nonce: "test-nonce",
        })
        return {
          success: true as const,
          data: { access_token: accessToken, id_token: idToken, token_type: "Bearer", expires_in: 3600 },
        }
      },
      organizationMembershipRead: async (_token: string, orgId: string) => ({
        success: true as const,
        data: {
          isExactMember: exactMembershipByOrg[orgId] ?? true,
          isOrganizationAdmin: false,
          diagnostics: undefined,
        },
      }),
    }

    const app = apiAppCreate({
      projectRepository: {
        projectsRead: () => ({ success: true as const, data: [] }),
        projectRead: () => ({ success: true as const, data: null }),
        projectBindingRead: () => ({ success: true as const, data: null }),
        environmentsRead: () => ({ success: true as const, data: [] }),
        projectCreate: () => ({ success: false as const, op: "mock", errorMessage: "mock" }),
        projectSettingsUpdate: () => ({ success: false as const, op: "mock", errorMessage: "mock" }),
      } as any,
      storageMigrationRepository: {} as any,
      storageMigrationWorkflowEnqueue: () => ({ success: true as const, data: { migrationId: "m", workflowId: "w" } }),
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
        now: () => nowSeconds * 1000,
      },
    })

    return {
      app,
      stateStore,
      setTokenForCode: (code: string, orgId: string, resourceOwnerId: string, isCustomer: boolean) => {
        tokenPayloadsForCode[code] = { orgId, resourceOwnerId, isCustomer }
      },
      setExactMembership: (orgId: string, isExactMember: boolean) => {
        exactMembershipByOrg[orgId] = isExactMember
      },
    }
  }

  test("initiates PKCE login via /api/v1/auth/login and receives state cookie", async () => {
    const fixture = await loginTestSetup()
    const response = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/login?returnTo=%2Fprojects", {
        headers: { accept: "application/json" },
      }),
    )
    expect(response.status).toBe(200)
    const setCookie = response.headers.get("set-cookie")
    expect(setCookie).toContain("assets_state=")
    const body = (await response.json()) as { ok: boolean; data: { authorizationUrl: string } }
    expect(body.ok).toBe(true)
    expect(body.data.authorizationUrl).toContain("https://zitadel.example.test/oauth/v2/authorize?state=")
  })

  test("completes login callback for Fabian owner, issuing admin session", async () => {
    const fixture = await loginTestSetup()
    const stateValue = "state-fabian"
    await fixture.stateStore.save(stateValue, {
      codeVerifier: "verifier-fabian",
      nonce: "test-nonce",
      returnTo: "/projects",
      createdAt: nowSeconds,
      expiresAt: nowSeconds + 600,
    })
    fixture.setTokenForCode("code-fabian", "org-fabian", "org-fabian", false)

    const callbackResponse = await fixture.app.fetch(
      new Request(`https://assets.example.test/api/v1/auth/callback?code=code-fabian&state=${stateValue}`, {
        headers: {
          cookie: `assets_state=${stateValue}`,
          accept: "application/json",
        },
      }),
    )
    expect(callbackResponse.status).toBe(200)
    const sessionCookieHeader = callbackResponse.headers.get("set-cookie")
    expect(sessionCookieHeader).toContain("assets_session=")
    const sessionCookieMatch = sessionCookieHeader?.match(/assets_session=([^;]+)/)
    const sessionCookie = sessionCookieMatch ? sessionCookieMatch[1] : ""

    const sessionResponse = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/session", {
        headers: { cookie: `assets_session=${sessionCookie}` },
      }),
    )
    expect(sessionResponse.status).toBe(200)
    const sessionBody = (await sessionResponse.json()) as {
      ok: boolean
      data: { authenticated: boolean; principal: AuthenticatedPrincipal }
    }
    expect(sessionBody.ok).toBe(true)
    expect(sessionBody.data.authenticated).toBe(true)
    expect(sessionBody.data.principal.organizationId).toBe("org-fabian")
    expect(sessionBody.data.principal.mode).toBe("admin")
    expect(sessionBody.data.principal.organizationAdmin).toBe(true)
  })

  test("completes login callback for Fabian-Customers, issuing contributor session with customer admin prohibition", async () => {
    const fixture = await loginTestSetup()
    const stateValue = "state-fabian-cust"
    await fixture.stateStore.save(stateValue, {
      codeVerifier: "verifier-cust",
      nonce: "test-nonce",
      returnTo: "/projects",
      createdAt: nowSeconds,
      expiresAt: nowSeconds + 600,
    })
    fixture.setTokenForCode("code-fabian-cust", "org-fabian-customers", "org-fabian-customers", true)
    fixture.setExactMembership("org-fabian-customers", true)

    const callbackResponse = await fixture.app.fetch(
      new Request(`https://assets.example.test/api/v1/auth/callback?code=code-fabian-cust&state=${stateValue}`, {
        headers: {
          cookie: `assets_state=${stateValue}`,
          accept: "application/json",
        },
      }),
    )
    expect(callbackResponse.status).toBe(200)
    const sessionCookieHeader = callbackResponse.headers.get("set-cookie")
    const sessionCookieMatch = sessionCookieHeader?.match(/assets_session=([^;]+)/)
    const sessionCookie = sessionCookieMatch ? sessionCookieMatch[1] : ""

    const sessionResponse = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/session", {
        headers: { cookie: `assets_session=${sessionCookie}` },
      }),
    )
    expect(sessionResponse.status).toBe(200)
    const sessionBody = (await sessionResponse.json()) as {
      ok: boolean
      data: { authenticated: boolean; principal: AuthenticatedPrincipal }
    }
    expect(sessionBody.ok).toBe(true)
    expect(sessionBody.data.principal.organizationId).toBe("org-fabian-customers")
    expect(sessionBody.data.principal.mode).toBe("contributor")
    expect(sessionBody.data.principal.organizationAdmin).toBe(false)
    expect(sessionBody.data.principal.grants).toEqual([{ projectId: "zitadel-proj-1", roles: ["contributor"] }])
  })

  test("rejects customer login callback if exact organization membership is missing", async () => {
    const fixture = await loginTestSetup()
    const stateValue = "state-nonmember"
    await fixture.stateStore.save(stateValue, {
      codeVerifier: "verifier-nonmember",
      nonce: "test-nonce",
      returnTo: "/projects",
      createdAt: nowSeconds,
      expiresAt: nowSeconds + 600,
    })
    fixture.setTokenForCode("code-nonmember", "org-fabian-customers", "org-fabian-customers", true)
    fixture.setExactMembership("org-fabian-customers", false)

    const callbackResponse = await fixture.app.fetch(
      new Request(`https://assets.example.test/api/v1/auth/callback?code=code-nonmember&state=${stateValue}`, {
        headers: {
          cookie: `assets_state=${stateValue}`,
          accept: "application/json",
        },
      }),
    )
    expect(callbackResponse.status).toBe(401)
  })

  test("completes login callback for David owner and Contentoren owner/customer", async () => {
    const fixture = await loginTestSetup()

    // David owner
    const davidState = "state-david"
    await fixture.stateStore.save(davidState, {
      codeVerifier: "v-david",
      nonce: "test-nonce",
      returnTo: "/projects",
      createdAt: nowSeconds,
      expiresAt: nowSeconds + 600,
    })
    fixture.setTokenForCode("code-david", "org-david", "org-david", false)
    const davidCallback = await fixture.app.fetch(
      new Request(`https://assets.example.test/api/v1/auth/callback?code=code-david&state=${davidState}`, {
        headers: { cookie: `assets_state=${davidState}`, accept: "application/json" },
      }),
    )
    expect(davidCallback.status).toBe(200)
    const davidCookie = davidCallback.headers.get("set-cookie")?.match(/assets_session=([^;]+)/)?.[1] ?? ""
    const davidSession = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/session", {
        headers: { cookie: `assets_session=${davidCookie}` },
      }),
    )
    const davidBody = (await davidSession.json()) as any
    expect(davidBody.data.principal.organizationId).toBe("org-david")
    expect(davidBody.data.principal.mode).toBe("admin")
    expect(davidBody.data.principal.organizationAdmin).toBe(true)

    // Contentoren owner
    const contentorenState = "state-contentoren"
    await fixture.stateStore.save(contentorenState, {
      codeVerifier: "v-contentoren",
      nonce: "test-nonce",
      returnTo: "/projects",
      createdAt: nowSeconds,
      expiresAt: nowSeconds + 600,
    })
    fixture.setTokenForCode("code-contentoren", "org-contentoren", "org-contentoren", false)
    const contentorenCallback = await fixture.app.fetch(
      new Request(`https://assets.example.test/api/v1/auth/callback?code=code-contentoren&state=${contentorenState}`, {
        headers: { cookie: `assets_state=${contentorenState}`, accept: "application/json" },
      }),
    )
    expect(contentorenCallback.status).toBe(200)
    const contentorenCookie = contentorenCallback.headers.get("set-cookie")?.match(/assets_session=([^;]+)/)?.[1] ?? ""
    const contentorenSession = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/session", {
        headers: { cookie: `assets_session=${contentorenCookie}` },
      }),
    )
    const contentorenBody = (await contentorenSession.json()) as any
    expect(contentorenBody.data.principal.organizationId).toBe("org-contentoren")
    expect(contentorenBody.data.principal.mode).toBe("admin")
    expect(contentorenBody.data.principal.organizationAdmin).toBe(true)

    // Contentoren customer
    const contentorenCustState = "state-contentoren-cust"
    await fixture.stateStore.save(contentorenCustState, {
      codeVerifier: "v-contentoren-cust",
      nonce: "test-nonce",
      returnTo: "/projects",
      createdAt: nowSeconds,
      expiresAt: nowSeconds + 600,
    })
    fixture.setTokenForCode("code-contentoren-cust", "org-contentoren-customers", "org-contentoren-customers", true)
    fixture.setExactMembership("org-contentoren-customers", true)
    const contentorenCustCallback = await fixture.app.fetch(
      new Request(
        `https://assets.example.test/api/v1/auth/callback?code=code-contentoren-cust&state=${contentorenCustState}`,
        {
          headers: { cookie: `assets_state=${contentorenCustState}`, accept: "application/json" },
        },
      ),
    )
    expect(contentorenCustCallback.status).toBe(200)
    const contentorenCustCookie =
      contentorenCustCallback.headers.get("set-cookie")?.match(/assets_session=([^;]+)/)?.[1] ?? ""
    const contentorenCustSession = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/auth/session", {
        headers: { cookie: `assets_session=${contentorenCustCookie}` },
      }),
    )
    const contentorenCustBody = (await contentorenCustSession.json()) as any
    expect(contentorenCustBody.data.principal.organizationId).toBe("org-contentoren-customers")
    expect(contentorenCustBody.data.principal.mode).toBe("contributor")
    expect(contentorenCustBody.data.principal.organizationAdmin).toBe(false)
  })

  test("rejects login callback for unconfigured organization", async () => {
    const fixture = await loginTestSetup()
    const stateValue = "state-unconfigured"
    await fixture.stateStore.save(stateValue, {
      codeVerifier: "v-unconf",
      nonce: "test-nonce",
      returnTo: "/projects",
      createdAt: nowSeconds,
      expiresAt: nowSeconds + 600,
    })
    fixture.setTokenForCode("code-unconf", "org-unconfigured", "org-unconfigured", false)
    const callbackResponse = await fixture.app.fetch(
      new Request(`https://assets.example.test/api/v1/auth/callback?code=code-unconf&state=${stateValue}`, {
        headers: { cookie: `assets_state=${stateValue}`, accept: "application/json" },
      }),
    )
    expect(callbackResponse.status).toBe(401)
  })
})

describe("Multi-organization Actual Database API Project Listing and Route Authorization", () => {
  const timestamp = "2026-08-17T00:00:00.000Z"

  const realDatabaseAppSetup = async () => {
    const dbOpenResult = databaseOpen(":memory:")
    if (!dbOpenResult.success) throw new Error("databaseOpen failed")
    const migrateResult = databaseMigrate(dbOpenResult.data)
    if (!migrateResult.success) throw new Error("databaseMigrate failed")
    const db = dbOpenResult.data.db

    // Insert organizations
    const orgs = [
      { id: "org-contentoren", name: "Contentoren", slug: "contentoren" },
      { id: "org-contentoren-customers", name: "Contentoren Customers", slug: "contentoren-customers" },
      { id: "org-fabian", name: "Fabian", slug: "fabian" },
      { id: "org-fabian-customers", name: "Fabian Customers", slug: "fabian-customers" },
      { id: "org-david", name: "David", slug: "david" },
    ]
    for (const org of orgs) {
      databaseRecordInsert(db, organizationTable, { ...org, createdAt: timestamp, updatedAt: timestamp })
    }

    // Insert projects and bindings
    const projects = [
      { id: "proj-c1", orgId: "org-contentoren", zitadelId: "zit-c1", serviceId: "srv-c1", name: "Contentoren 1" },
      { id: "proj-c2", orgId: "org-contentoren", zitadelId: "zit-c2", serviceId: "srv-c2", name: "Contentoren 2" },
      { id: "proj-f1", orgId: "org-fabian", zitadelId: "zit-f1", serviceId: "srv-f1", name: "Fabian 1" },
      { id: "proj-f2", orgId: "org-fabian", zitadelId: "zit-f2", serviceId: "srv-f2", name: "Fabian 2" },
      { id: "proj-d1", orgId: "org-david", zitadelId: "zit-d1", serviceId: "srv-d1", name: "David 1" },
    ]
    for (const p of projects) {
      databaseRecordInsert(db, projectTable, {
        id: p.id,
        organizationId: p.orgId,
        name: p.name,
        slug: p.id,
        defaultEnvironment: "development",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      databaseRecordInsert(db, projectBindingTable, {
        id: `binding-${p.id}`,
        projectId: p.id,
        organizationId: p.orgId,
        zitadelProjectId: p.zitadelId,
        serviceProjectId: p.serviceId,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      databaseRecordInsert(db, environmentTable, {
        id: `env-${p.id}`,
        projectId: p.id,
        name: "development",
        r2Bucket: "assets-bucket",
        r2Prefix: p.id,
        publicBaseUrl: `https://${p.id}.example.test`,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }

    const projectRepository = projectRepositoryCreate(db)
    const sessionStore = memorySessionStoreCreate()
    const stateStore = memoryPkceStateStoreCreate({ now: () => nowSeconds * 1000 })

    const app = apiAppCreate({
      projectRepository,
      storageMigrationRepository: {} as any,
      storageMigrationWorkflowEnqueue: () => ({ success: true as const, data: { migrationId: "m", workflowId: "w" } }),
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
        oidcClient: {} as any,
        jwksClient: {} as any,
        serviceBearer: undefined,
        now: () => nowSeconds * 1000,
      },
    })

    const cookieForPrincipal = async (principal: AuthenticatedPrincipal): Promise<string> => {
      const sessionResult = await sessionStore.create({
        principal,
        createdAt: nowSeconds,
        expiresAt: nowSeconds + 3600,
        rotateAt: nowSeconds + 3600,
        sessionPolicyVersion: 2,
      })
      if (!sessionResult.success) throw new Error(sessionResult.errorMessage)
      return `${config.sessionCookieName}=${sessionResult.data}`
    }

    return { app, cookieForPrincipal }
  }

  test("GET /api/v1/projects against actual database enforces tenant isolation and grant scoping", async () => {
    const fixture = await realDatabaseAppSetup()

    // 1. Contentoren admin sees only Contentoren projects
    const contentorenCookie = await fixture.cookieForPrincipal({
      subjectId: "user-contentoren",
      organizationId: "org-contentoren",
      mode: "admin",
      organizationAdmin: true,
      method: "human_session",
      grants: [],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    })
    const contentorenList = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects", { headers: { cookie: contentorenCookie } }),
    )
    expect(contentorenList.status).toBe(200)
    const contentorenData = (await contentorenList.json()) as any
    expect(contentorenData.data.projects.map((p: any) => p.id)).toEqual(["proj-c1", "proj-c2"])

    // 2. Fabian admin sees only Fabian projects
    const fabianCookie = await fixture.cookieForPrincipal({
      subjectId: "user-fabian",
      organizationId: "org-fabian",
      mode: "admin",
      organizationAdmin: true,
      method: "human_session",
      grants: [],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    })
    const fabianList = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects", { headers: { cookie: fabianCookie } }),
    )
    expect(fabianList.status).toBe(200)
    const fabianData = (await fabianList.json()) as any
    expect(fabianData.data.projects.map((p: any) => p.id)).toEqual(["proj-f1", "proj-f2"])

    // 3. David admin sees only David projects
    const davidCookie = await fixture.cookieForPrincipal({
      subjectId: "user-david",
      organizationId: "org-david",
      mode: "admin",
      organizationAdmin: true,
      method: "human_session",
      grants: [],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    })
    const davidList = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects", { headers: { cookie: davidCookie } }),
    )
    expect(davidList.status).toBe(200)
    const davidData = (await davidList.json()) as any
    expect(davidData.data.projects.map((p: any) => p.id)).toEqual(["proj-d1"])

    // 4. Fabian customer granted zit-f1 sees only proj-f1
    const fabianCustCookie = await fixture.cookieForPrincipal({
      subjectId: "user-fabian-cust",
      organizationId: "org-fabian-customers",
      mode: "contributor",
      organizationAdmin: false,
      method: "human_session",
      grants: [{ projectId: "zit-f1", roles: ["contributor"] }],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    })
    const fabianCustList = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects", { headers: { cookie: fabianCustCookie } }),
    )
    expect(fabianCustList.status).toBe(200)
    const fabianCustData = (await fabianCustList.json()) as any
    expect(fabianCustData.data.projects.map((p: any) => p.id)).toEqual(["proj-f1"])

    // 5. Cross-tenant grant isolation: Fabian customer granted zit-f1 AND zit-c1 sees ONLY proj-f1
    const crossCustCookie = await fixture.cookieForPrincipal({
      subjectId: "user-cross-cust",
      organizationId: "org-fabian-customers",
      mode: "contributor",
      organizationAdmin: false,
      method: "human_session",
      grants: [
        { projectId: "zit-f1", roles: ["contributor"] },
        { projectId: "zit-c1", roles: ["contributor"] },
      ],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    })
    const crossCustList = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects", { headers: { cookie: crossCustCookie } }),
    )
    expect(crossCustList.status).toBe(200)
    const crossCustData = (await crossCustList.json()) as any
    expect(crossCustData.data.projects.map((p: any) => p.id)).toEqual(["proj-f1"])

    // 6. Contentoren customer granted zit-c2 sees only proj-c2
    const contentorenCustCookie = await fixture.cookieForPrincipal({
      subjectId: "user-contentoren-cust",
      organizationId: "org-contentoren-customers",
      mode: "contributor",
      organizationAdmin: false,
      method: "human_session",
      grants: [{ projectId: "zit-c2", roles: ["contributor"] }],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    })
    const contentorenCustList = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects", { headers: { cookie: contentorenCustCookie } }),
    )
    expect(contentorenCustList.status).toBe(200)
    const contentorenCustData = (await contentorenCustList.json()) as any
    expect(contentorenCustData.data.projects.map((p: any) => p.id)).toEqual(["proj-c2"])

    // 7. Customer with no grants sees empty list
    const noGrantsCookie = await fixture.cookieForPrincipal({
      subjectId: "user-no-grants",
      organizationId: "org-fabian-customers",
      mode: "contributor",
      organizationAdmin: false,
      method: "human_session",
      grants: [],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    })
    const noGrantsList = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects", { headers: { cookie: noGrantsCookie } }),
    )
    expect(noGrantsList.status).toBe(200)
    const noGrantsData = (await noGrantsList.json()) as any
    expect(noGrantsData.data.projects).toEqual([])
  })

  test("enforces customer admin prohibition and project route isolation through middleware", async () => {
    const fixture = await realDatabaseAppSetup()

    const fabianAdminCookie = await fixture.cookieForPrincipal({
      subjectId: "user-fabian",
      organizationId: "org-fabian",
      mode: "admin",
      organizationAdmin: true,
      method: "human_session",
      grants: [],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    })

    const fabianCustomerCookie = await fixture.cookieForPrincipal({
      subjectId: "user-fabian-cust",
      organizationId: "org-fabian-customers",
      mode: "contributor",
      organizationAdmin: false,
      method: "human_session",
      grants: [{ projectId: "zit-f1", roles: ["contributor"] }],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    })

    const contentorenAdminCookie = await fixture.cookieForPrincipal({
      subjectId: "user-contentoren",
      organizationId: "org-contentoren",
      mode: "admin",
      organizationAdmin: true,
      method: "human_session",
      grants: [],
      issuedAt: nowSeconds,
      expiresAt: nowSeconds + 3600,
    })

    // Contributor route: GET /api/v1/projects/:projectId
    // Fabian customer can read granted proj-f1
    const readGranted = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects/proj-f1", {
        headers: { cookie: fabianCustomerCookie },
      }),
    )
    expect(readGranted.status).toBe(200)

    // Fabian customer cannot read ungranted proj-f2
    const readUngranted = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects/proj-f2", {
        headers: { cookie: fabianCustomerCookie },
      }),
    )
    expect(readUngranted.status).toBe(403)

    // Fabian customer cannot read cross-tenant proj-c1
    const readCrossTenant = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects/proj-c1", {
        headers: { cookie: fabianCustomerCookie },
      }),
    )
    expect(readCrossTenant.status).toBe(403)

    // Customer cannot read David project (no customer mapping for David)
    const readDavid = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects/proj-d1", {
        headers: { cookie: fabianCustomerCookie },
      }),
    )
    expect(readDavid.status).toBe(403)

    // Admin route: GET /api/v1/projects/:projectId/settings
    // Fabian admin can read settings
    const adminReadSettings = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects/proj-f1/settings", {
        headers: { cookie: fabianAdminCookie },
      }),
    )
    expect(adminReadSettings.status).toBe(200)

    // Fabian customer CANNOT read settings (customer admin prohibition)
    const customerReadSettings = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects/proj-f1/settings", {
        headers: { cookie: fabianCustomerCookie },
      }),
    )
    expect(customerReadSettings.status).toBe(403)

    // Contentoren admin CANNOT read Fabian project settings (tenant isolation)
    const crossAdminReadSettings = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects/proj-f1/settings", {
        headers: { cookie: contentorenAdminCookie },
      }),
    )
    expect(crossAdminReadSettings.status).toBe(403)

    // Project creation: POST /api/v1/projects
    // Customer cannot create projects
    const customerCreate = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { cookie: fabianCustomerCookie, "content-type": "application/json" },
        body: JSON.stringify({
          organization: { id: "org-fabian", name: "Fabian", slug: "fabian" },
          name: "Unauthorized Customer Project",
          slug: "unauthorized-cust-proj",
          defaultEnvironment: "development",
          binding: { zitadelProjectId: "zit-new", serviceProjectId: "srv-new" },
          environments: [
            {
              name: "development",
              r2Bucket: "assets",
              r2Prefix: "new",
              publicBaseUrl: "https://new.test",
            },
          ],
        }),
      }),
    )
    expect(customerCreate.status).toBe(403)

    // Fabian admin cannot create project for Contentoren
    const crossOrgCreate = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { cookie: fabianAdminCookie, "content-type": "application/json" },
        body: JSON.stringify({
          organization: { id: "org-contentoren", name: "Contentoren", slug: "contentoren" },
          name: "Cross Org Project",
          slug: "cross-org-proj",
          defaultEnvironment: "development",
          binding: { zitadelProjectId: "zit-new-2", serviceProjectId: "srv-new-2" },
          environments: [
            {
              name: "development",
              r2Bucket: "assets",
              r2Prefix: "new-2/dev",
              publicBaseUrl: "https://new-2-dev.test",
            },
            {
              name: "production",
              r2Bucket: "assets",
              r2Prefix: "new-2/prod",
              publicBaseUrl: "https://new-2-prod.test",
            },
          ],
        }),
      }),
    )
    expect(crossOrgCreate.status).toBe(403)

    // Fabian admin can create project for Fabian
    const validCreate = await fixture.app.fetch(
      new Request("https://assets.example.test/api/v1/projects", {
        method: "POST",
        headers: { cookie: fabianAdminCookie, "content-type": "application/json" },
        body: JSON.stringify({
          organization: { id: "org-fabian", name: "Fabian", slug: "fabian" },
          name: "New Fabian Project",
          slug: "new-fabian-proj",
          defaultEnvironment: "development",
          binding: { zitadelProjectId: "zit-new-3", serviceProjectId: "srv-new-3" },
          environments: [
            {
              name: "development",
              r2Bucket: "assets",
              r2Prefix: "new-3/dev",
              publicBaseUrl: "https://new-3-dev.test",
            },
            {
              name: "production",
              r2Bucket: "assets",
              r2Prefix: "new-3/prod",
              publicBaseUrl: "https://new-3-prod.test",
            },
          ],
        }),
      }),
    )
    expect(validCreate.status).toBe(201)
  })
})
