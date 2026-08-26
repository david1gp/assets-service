import * as v from "valibot"

import type { PkceLoginRequest } from "../../authentication/pkceLoginRequestSchema.js"
import { type TokenResponse, tokenResponseSchema } from "../../authentication/tokenResponseSchema.js"
import type { ZitadelAuthConfig } from "../../authentication/zitadelAuthConfigSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { ZitadelOidcClient } from "./zitadelOidcClient.js"
import { type ZitadelOidcDiscovery, zitadelOidcDiscoverySchema } from "./zitadelOidcDiscoverySchema.js"
import { zitadelMembershipSearchResponseSchema } from "./zitadelMembershipSearchResponseSchema.js"

const organizationAdministratorRoles = new Set([
  "ORG_OWNER",
  "ORG_OWNER_VIEWER",
  "ORG_PROJECT_MANAGER",
  "ORG_PROJECT_MANAGER_VIEWER",
])

type ZitadelOidcClientOptions = {
  config: ZitadelAuthConfig
  fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>
}

const responseBodyRead = async (response: Response, op: string): Promise<Result<unknown>> => {
  try {
    return { success: true, data: await response.json() }
  } catch (error) {
    return resultErrorCreate(op, "The Zitadel response was not valid JSON", error)
  }
}

export const zitadelOidcClientCreate = (options: ZitadelOidcClientOptions): ZitadelOidcClient => {
  const fetcher = options.fetcher ?? fetch
  let discovery: ZitadelOidcDiscovery | undefined

  const discoveryRead = async (): Promise<Result<ZitadelOidcDiscovery>> => {
    if (discovery) return { success: true, data: discovery }
    const issuer = options.config.issuer.endsWith("/") ? options.config.issuer : `${options.config.issuer}/`
    let discoveryUri: string
    try {
      discoveryUri = new URL(".well-known/openid-configuration", issuer).toString()
    } catch (error) {
      return resultErrorCreate("zitadelOidcDiscoveryRead", "The configured issuer URL was invalid", error)
    }
    let response: Response
    try {
      response = await fetcher(discoveryUri, { headers: { accept: "application/json" } })
    } catch (error) {
      return resultErrorCreate("zitadelOidcDiscoveryRead", "Unable to reach the Zitadel discovery endpoint", error)
    }
    if (!response.ok)
      return resultErrorCreate("zitadelOidcDiscoveryRead", "The Zitadel discovery endpoint returned an error")
    const body = await responseBodyRead(response, "zitadelOidcDiscoveryRead")
    if (!body.success) return body
    const parsed = v.safeParse(zitadelOidcDiscoverySchema, body.data)
    if (!parsed.success)
      return resultErrorCreate("zitadelOidcDiscoveryRead", "The Zitadel discovery response was invalid")
    if (parsed.output.issuer !== options.config.issuer) {
      return resultErrorCreate("zitadelOidcDiscoveryRead", "The Zitadel discovery issuer did not match configuration")
    }
    discovery = parsed.output
    return { success: true, data: discovery }
  }

  const authorizationUrlCreate = async (
    input: PkceLoginRequest & { state: string; codeChallenge: string; nonce: string },
  ): Promise<Result<string>> => {
    const discovered = await discoveryRead()
    if (!discovered.success) return discovered
    try {
      const url = new URL(discovered.data.authorization_endpoint)
      url.searchParams.set("response_type", "code")
      url.searchParams.set("client_id", options.config.clientId)
      url.searchParams.set("redirect_uri", options.config.redirectUri)
      url.searchParams.set(
        "scope",
        "openid profile email urn:zitadel:iam:org:project:roles urn:zitadel:iam:org:id urn:zitadel:iam:user:resourceowner urn:zitadel:iam:user:resourceowner:id urn:zitadel:iam:org:project:id",
      )
      url.searchParams.set("state", input.state)
      url.searchParams.set("code_challenge", input.codeChallenge)
      url.searchParams.set("code_challenge_method", "S256")
      url.searchParams.set("nonce", input.nonce)
      return { success: true, data: url.toString() }
    } catch (error) {
      return resultErrorCreate("zitadelAuthorizationUrlCreate", "The Zitadel authorization endpoint was invalid", error)
    }
  }

  const authorizationCodeExchange = async (code: string, codeVerifier: string): Promise<Result<TokenResponse>> => {
    const discovered = await discoveryRead()
    if (!discovered.success) return discovered
    let response: Response
    try {
      response = await fetcher(discovered.data.token_endpoint, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: options.config.clientId,
          code,
          code_verifier: codeVerifier,
          redirect_uri: options.config.redirectUri,
        }),
      })
    } catch (error) {
      return resultErrorCreate("zitadelAuthorizationCodeExchange", "Unable to reach the Zitadel token endpoint", error)
    }
    const body = await responseBodyRead(response, "zitadelAuthorizationCodeExchange")
    if (!body.success) return body
    if (!response.ok)
      return resultErrorCreate("zitadelAuthorizationCodeExchange", "The Zitadel token endpoint returned an error")
    const parsed = v.safeParse(tokenResponseSchema, body.data)
    if (!parsed.success)
      return resultErrorCreate("zitadelAuthorizationCodeExchange", "The Zitadel token response was invalid")
    return { success: true, data: parsed.output }
  }

  const organizationMembershipRead = async (accessToken: string, organizationId: string): Promise<Result<boolean>> => {
    const op = "zitadelOrganizationMembershipRead"
    let membershipsUri: string
    try {
      const base = options.config.issuer.endsWith("/") ? options.config.issuer : `${options.config.issuer}/`
      membershipsUri = new URL("auth/v1/memberships/me/_search", base).toString()
    } catch (error) {
      return resultErrorCreate(op, "The configured issuer URL was invalid", error)
    }
    let response: Response
    try {
      response = await fetcher(membershipsUri, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ queries: [{ orgQuery: { orgId: organizationId } }] }),
      })
    } catch (error) {
      return resultErrorCreate(op, "Unable to reach the Zitadel membership endpoint", error, { retryable: true })
    }
    if (!response.ok)
      return resultErrorCreate(op, "The Zitadel membership lookup failed", undefined, {
        retryable: response.status === 429 || response.status >= 500,
      })
    const body = await responseBodyRead(response, op)
    if (!body.success) return body
    const parsed = v.safeParse(zitadelMembershipSearchResponseSchema, body.data)
    if (!parsed.success) return resultErrorCreate(op, "The Zitadel membership response was invalid")
    const organizationAdmin = parsed.output.result.some(
      (membership) =>
        membership.orgId === organizationId &&
        membership.roles.some((role) => organizationAdministratorRoles.has(role)),
    )
    return { success: true, data: organizationAdmin }
  }

  return { discoveryRead, authorizationUrlCreate, authorizationCodeExchange, organizationMembershipRead }
}
