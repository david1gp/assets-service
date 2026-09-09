import * as v from "valibot"

import type { ZitadelJwksClient } from "../infrastructure/zitadel/zitadelJwksClient.js"
import type { ZitadelOidcClient } from "../infrastructure/zitadel/zitadelOidcClient.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { jwtPrincipalValidate } from "./jwtPrincipalValidate.js"
import { jwtTokenParse } from "./jwtTokenParse.js"
import { jwtTokenSignatureVerify } from "./jwtTokenSignatureVerify.js"
import { oidcIdTokenDisplayNameExtract } from "./oidcIdTokenDisplayNameExtract.js"
import type { PkceCallbackRequest } from "./pkceCallbackRequestSchema.js"
import { pkceCallbackRequestSchema } from "./pkceCallbackRequestSchema.js"
import type { PkceStateStore } from "./pkceStateStore.js"
import type { ProjectGrant } from "./projectGrantSchema.js"
import { sessionCookieCreate } from "./sessionCookieCreate.js"
import type { AuthenticationSession } from "./sessionSchema.js"
import type { SessionStore } from "./sessionStore.js"
import type { SessionAccessTokenStore } from "./sessionAccessTokenStore.js"
import { userGrantsNormalize } from "./userGrantsNormalize.js"
import type { ZitadelAuthConfig } from "./zitadelAuthConfigSchema.js"
import { zitadelOrganizationContextCreate } from "./zitadelOrganizationContextCreate.js"

type HumanLoginCallbackOptions = {
  config: ZitadelAuthConfig
  stateStore: PkceStateStore
  sessionStore: SessionStore
  sessionAccessTokenStore?: SessionAccessTokenStore
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
  let verifiedIdTokenPayload: Record<string, unknown> | undefined
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
    const idIssuedAt = idToken.data.payload.iat
    const idExpiresAt = idToken.data.payload.exp
    const nowSeconds = Math.floor((options.now ?? (() => Date.now()))() / 1000)
    const skew = options.config.clockSkewSeconds
    if (
      typeof idIssuedAt !== "number" ||
      !Number.isInteger(idIssuedAt) ||
      typeof idExpiresAt !== "number" ||
      !Number.isInteger(idExpiresAt)
    ) {
      return resultErrorCreate(op, "The OIDC ID token time claims were invalid")
    }
    if (idExpiresAt <= nowSeconds - skew) {
      return resultErrorCreate(op, "The OIDC ID token expiry was invalid")
    }
    if (idIssuedAt > nowSeconds + skew || idExpiresAt <= idIssuedAt) {
      return resultErrorCreate(op, "The OIDC ID token issue time was invalid")
    }
    if (idToken.data.payload.nbf !== undefined) {
      const idNotBefore = idToken.data.payload.nbf
      if (typeof idNotBefore !== "number" || !Number.isInteger(idNotBefore)) {
        return resultErrorCreate(op, "The OIDC ID token not-before claim was invalid")
      }
      if (idNotBefore > nowSeconds + skew) {
        return resultErrorCreate(op, "The OIDC ID token is not active yet")
      }
    }
    verifiedIdTokenPayload = idToken.data.payload
  }

  const organizationContext = zitadelOrganizationContextCreate(
    options.config.organizationMappings ?? [
      {
        ownerOrganizationId: options.config.organizationId,
        customerOrganizationId: options.config.customerOrganizationId,
      },
    ],
  )
  const principal = await jwtPrincipalValidate(token.data.access_token, {
    issuer: options.config.issuer,
    audience: options.config.audience,
    jwksUri: discovery.data.jwks_uri,
    jwksClient: options.jwksClient,
    organizationId: options.config.organizationId,
    customerOrganizationId: options.config.customerOrganizationId,
    ownerOrganizationIds: organizationContext.ownerOrganizationIds,
    customerOrganizationIds: organizationContext.customerOrganizationIds,
    allowedOrganizationIds: organizationContext.allowedOrganizationIds,
    defaultProjectId: options.config.projectId,
    method: "human_session",
    now: options.now,
    clockSkewSeconds: options.config.clockSkewSeconds,
  })
  if (!principal.success) return principal
  let displayName: string | undefined
  if (verifiedIdTokenPayload !== undefined) {
    if (verifiedIdTokenPayload.sub !== principal.data.subjectId) {
      return resultErrorCreate(op, "The OIDC ID token subject did not match the access token subject")
    }
    displayName = oidcIdTokenDisplayNameExtract(verifiedIdTokenPayload)
  }

  const isOwnerOrganization = organizationContext.isOwner(principal.data.organizationId)
  const isCustomerOrganization = organizationContext.isCustomer(principal.data.organizationId)
  if (!isOwnerOrganization && !isCustomerOrganization) return resultErrorCreate(op, "The JWT organization was invalid")

  if (isCustomerOrganization) {
    const membership = await options.oidcClient.organizationMembershipRead(
      token.data.access_token,
      principal.data.organizationId,
    )
    if (!membership.success) return membership
    if (!membership.data.isExactMember) {
      return resultErrorCreate(op, "The exact organization membership was missing", undefined, {
        diagnostics: membership.data.diagnostics,
      })
    }
  }

  let grants: ProjectGrant[]
  if (options.oidcClient.userGrantsRead !== undefined) {
    const userGrantsResult = await options.oidcClient.userGrantsRead(token.data.access_token)
    if (!userGrantsResult.success) return userGrantsResult
    const discoveredGrants = userGrantsNormalize(userGrantsResult.data, {
      organizationId: principal.data.organizationId,
      allowedRoles: isCustomerOrganization ? ["contributor"] : undefined,
    })
    grants = discoveredGrants
  } else {
    grants = isCustomerOrganization
      ? principal.data.grants
          .map((grant) => ({
            ...grant,
            roles: grant.roles.filter((role) => role === "contributor"),
          }))
          .filter((grant) => grant.roles.length > 0)
      : principal.data.grants
  }

  if (isCustomerOrganization && grants.length === 0) {
    return resultErrorCreate(op, "The JWT did not contain the required project grant")
  }
  const isOrganizationAdmin = isOwnerOrganization
  const sessionPolicyVersion = options.sessionStore.sessionPolicyVersionRead()
  if (!sessionPolicyVersion.success) return sessionPolicyVersion

  const now = Math.floor((options.now ?? (() => Date.now()))() / 1000)
  const expiresAt = Math.min(now + options.config.sessionTtlSeconds, principal.data.expiresAt)
  let accessTokenReference: string | undefined
  if (options.sessionAccessTokenStore !== undefined) {
    const reference = options.sessionAccessTokenStore.create(token.data.access_token, expiresAt)
    if (!reference.success) return reference
    accessTokenReference = reference.data
  }
  const session: AuthenticationSession = {
    principal: {
      ...principal.data,
      ...(displayName === undefined ? {} : { displayName }),
      mode: isOwnerOrganization ? "admin" : "contributor",
      grants,
      organizationAdmin: isOrganizationAdmin,
      expiresAt,
    },
    createdAt: now,
    expiresAt,
    rotateAt: Math.min(now + options.config.sessionRotationSeconds, expiresAt),
    sessionPolicyVersion: sessionPolicyVersion.data,
    identityOrganizationId: principal.data.organizationId,
    identityGrants: grants,
    ...(accessTokenReference === undefined ? {} : { accessTokenReference }),
  }
  const sessionId = await options.sessionStore.create(session)
  if (!sessionId.success) {
    if (accessTokenReference !== undefined) options.sessionAccessTokenStore?.revoke(accessTokenReference)
    return sessionId
  }
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
