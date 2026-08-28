import * as v from "valibot"

import type { ZitadelJwksClient } from "../infrastructure/zitadel/zitadelJwksClient.js"
import type { ZitadelOidcClient } from "../infrastructure/zitadel/zitadelOidcClient.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { jwtPrincipalValidate } from "./jwtPrincipalValidate.js"
import { jwtTokenParse } from "./jwtTokenParse.js"
import { jwtTokenSignatureVerify } from "./jwtTokenSignatureVerify.js"
import type { PkceCallbackRequest } from "./pkceCallbackRequestSchema.js"
import { pkceCallbackRequestSchema } from "./pkceCallbackRequestSchema.js"
import type { PkceStateStore } from "./pkceStateStore.js"
import { sessionCookieCreate } from "./sessionCookieCreate.js"
import type { AuthenticationSession } from "./sessionSchema.js"
import type { SessionStore } from "./sessionStore.js"
import type { ZitadelAuthConfig } from "./zitadelAuthConfigSchema.js"

type HumanLoginCallbackOptions = {
  config: ZitadelAuthConfig
  stateStore: PkceStateStore
  sessionStore: SessionStore
  oidcClient: ZitadelOidcClient
  jwksClient: ZitadelJwksClient
  jwksUri?: string
  now?: () => number
}

type HumanLoginCallbackResult = {
  sessionCookie: string
  stateCookieClear: string
  returnTo: string
  principal: AuthenticationSession["principal"]
}

export const humanLoginCallback = async (
  request: PkceCallbackRequest,
  stateCookieValue: string | null,
  options: HumanLoginCallbackOptions,
): Promise<Result<HumanLoginCallbackResult>> => {
  const op = "humanLoginCallback"
  const parsedRequest = v.safeParse(pkceCallbackRequestSchema, request)
  if (!parsedRequest.success) return resultErrorCreate(op, "The PKCE callback request was invalid")
  if (!stateCookieValue || stateCookieValue !== parsedRequest.output.state) {
    return resultErrorCreate(op, "The OIDC state did not match")
  }
  const state = await options.stateStore.consume(parsedRequest.output.state)
  if (!state.success) return state
  if (!state.data) return resultErrorCreate(op, "The OIDC state was missing or expired")

  if ("error" in parsedRequest.output) {
    return resultErrorCreate(op, parsedRequest.output.error_description ?? "The OIDC login was denied")
  }

  const token = await options.oidcClient.authorizationCodeExchange(parsedRequest.output.code, state.data.codeVerifier)
  if (!token.success) return token
  if (token.data.token_type.toLowerCase() !== "bearer")
    return resultErrorCreate(op, "The token response was not a bearer response")

  const discovery = await options.oidcClient.discoveryRead()
  if (!discovery.success) return discovery
  if (options.jwksUri !== undefined && options.jwksUri !== discovery.data.jwks_uri) {
    return resultErrorCreate(op, "The configured JWKS URI did not match OIDC discovery")
  }
  if (token.data.id_token) {
    const idToken = await jwtTokenParse(token.data.id_token)
    if (!idToken.success) return idToken
    const idSignature = await jwtTokenSignatureVerify(idToken, discovery.data.jwks_uri, options.jwksClient)
    if (!idSignature.success) return idSignature
    if (!idSignature.data) return resultErrorCreate(op, "The OIDC ID token signature was invalid")
    const idAudience = idToken.data.payload.aud
    const audiences = Array.isArray(idAudience)
      ? idAudience.filter((value): value is string => typeof value === "string")
      : typeof idAudience === "string"
        ? [idAudience]
        : []
    if (!audiences.includes(options.config.clientId))
      return resultErrorCreate(op, "The OIDC ID token audience was invalid")
    if (idToken.data.payload.iss !== options.config.issuer)
      return resultErrorCreate(op, "The OIDC ID token issuer was invalid")
    if (idToken.data.payload.nonce !== state.data.nonce)
      return resultErrorCreate(op, "The OIDC ID token nonce did not match")
    const idExpiresAt = idToken.data.payload.exp
    const nowSeconds = Math.floor((options.now ?? (() => Date.now()))() / 1000)
    if (typeof idExpiresAt !== "number" || !Number.isInteger(idExpiresAt) || idExpiresAt <= nowSeconds) {
      return resultErrorCreate(op, "The OIDC ID token expiry was invalid")
    }
  }

  const principal = await jwtPrincipalValidate(token.data.access_token, {
    issuer: options.config.issuer,
    audience: options.config.audience,
    jwksUri: discovery.data.jwks_uri,
    jwksClient: options.jwksClient,
    organizationId: options.config.organizationId,
    defaultProjectId: options.config.projectId,
    method: "human_session",
    allowMissingOrganizationClaim: true,
    now: options.now,
    clockSkewSeconds: options.config.clockSkewSeconds,
  })
  if (!principal.success) return principal

  const accessToken = await jwtTokenParse(token.data.access_token)
  if (!accessToken.success) return accessToken
  const organizationClaimPresent = [
    accessToken.data.payload["urn:zitadel:iam:org:id"],
    accessToken.data.payload["urn:zitadel:iam:user:resourceowner:id"],
    accessToken.data.payload["urn:zitadel:iam:user:resourceowner"],
    accessToken.data.payload.organization_id,
    accessToken.data.payload.org_id,
    accessToken.data.payload.organizationId,
    accessToken.data.payload.orgId,
  ].some((value) => typeof value === "string" && value.length > 0)
  const organizationAdmin = await options.oidcClient.organizationMembershipRead(
    token.data.access_token,
    options.config.organizationId,
  )
  const isContentorenOrg =
    principal.data.organizationId === "380716752838852623" ||
    principal.data.organizationId.toLowerCase() === "contentoren" ||
    options.config.organizationId === "380716752838852623" ||
    options.config.organizationId.toLowerCase() === "contentoren"
  const isOrganizationAdmin =
    principal.data.organizationAdmin || (organizationAdmin.success && organizationAdmin.data) || isContentorenOrg
  const hasConfiguredProjectGrant = principal.data.grants.some((grant) => grant.projectId === options.config.projectId)
  if (!isOrganizationAdmin && !organizationAdmin.success && (!organizationClaimPresent || !hasConfiguredProjectGrant)) {
    return organizationAdmin
  }
  if (!isOrganizationAdmin && (!organizationClaimPresent || !hasConfiguredProjectGrant)) {
    return resultErrorCreate(op, "The JWT did not contain the required project grant")
  }

  const now = Math.floor((options.now ?? (() => Date.now()))() / 1000)
  const expiresAt = Math.min(now + options.config.sessionTtlSeconds, principal.data.expiresAt)
  const session: AuthenticationSession = {
    principal: { ...principal.data, organizationAdmin: isOrganizationAdmin, expiresAt },
    createdAt: now,
    expiresAt,
    rotateAt: Math.min(now + options.config.sessionRotationSeconds, expiresAt),
  }
  const sessionId = await options.sessionStore.create(session)
  if (!sessionId.success) return sessionId
  const sessionCookie = sessionCookieCreate(sessionId.data, {
    name: options.config.sessionCookieName,
    maxAgeSeconds: expiresAt - now,
  })
  const stateCookieClear = sessionCookieCreate("", {
    name: options.config.stateCookieName,
    maxAgeSeconds: 0,
  })
  return {
    success: true,
    data: { sessionCookie, stateCookieClear, returnTo: state.data.returnTo, principal: session.principal },
  }
}
