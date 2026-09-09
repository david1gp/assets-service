import * as v from "valibot"

import type { ZitadelJwksClient } from "../infrastructure/zitadel/zitadelJwksClient.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { AuthenticatedPrincipal } from "./authenticatedPrincipalSchema.js"
import { authenticatedPrincipalSchema } from "./authenticatedPrincipalSchema.js"
import { jwtProjectGrantsRead } from "./jwtProjectGrantsRead.js"
import { jwtTokenParse } from "./jwtTokenParse.js"
import { jwtTokenSignatureVerify } from "./jwtTokenSignatureVerify.js"

type JwtPrincipalValidateOptions = {
  issuer: string
  audience: string
  jwksUri?: string
  discoveryRead?: () => Promise<Result<{ issuer: string; jwks_uri: string }>>
  jwksClient: ZitadelJwksClient
  organizationId: string
  customerOrganizationId?: string
  ownerOrganizationIds?: readonly string[]
  customerOrganizationIds?: readonly string[]
  defaultProjectId?: string
  requiredClientId?: string
  requiredProjectId?: string
  allowMissingOrganizationClaim?: boolean
  allowedOrganizationIds?: readonly string[]
  method: "human_session" | "service_account"
  now?: () => number
  clockSkewSeconds?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const stringRead = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null)

const stringArrayRead = (value: unknown): string[] => {
  if (typeof value === "string" && value.length > 0) return [value]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.length > 0)
}

const numberRead = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) ? value : null

export const jwtPrincipalValidate = async (
  token: string,
  options: JwtPrincipalValidateOptions,
): Promise<Result<AuthenticatedPrincipal>> => {
  const op = "jwtPrincipalValidate"
  const parsed = await jwtTokenParse(token)
  if (!parsed.success) return parsed
  let jwksUri = options.jwksUri
  if (options.discoveryRead) {
    const discovery = await options.discoveryRead()
    if (!discovery.success) return discovery
    if (discovery.data.issuer !== options.issuer) return resultErrorCreate(op, "The OIDC discovery issuer was invalid")
    if (jwksUri !== undefined && jwksUri !== discovery.data.jwks_uri)
      return resultErrorCreate(op, "The configured JWKS URI did not match OIDC discovery")
    jwksUri = discovery.data.jwks_uri
  }
  if (!jwksUri) return resultErrorCreate(op, "The JWKS URI was missing")
  const signature = await jwtTokenSignatureVerify(parsed, jwksUri, options.jwksClient)
  if (!signature.success) return signature
  if (!signature.data) return resultErrorCreate(op, "The JWT signature was invalid")

  const claims = parsed.data.payload
  if (claims.iss !== options.issuer) return resultErrorCreate(op, "The JWT issuer was invalid")
  const audiences = stringArrayRead(claims.aud)
  if (!audiences.includes(options.audience)) return resultErrorCreate(op, "The JWT audience was invalid")
  const subjectId = stringRead(claims.sub)
  if (!subjectId) return resultErrorCreate(op, "The JWT subject was missing")
  if (options.requiredClientId) {
    const clientId = stringRead(claims.client_id) ?? stringRead(claims.azp)
    if (clientId !== options.requiredClientId) return resultErrorCreate(op, "The service account client was invalid")
  }

  const now = Math.floor((options.now ?? (() => Date.now()))() / 1000)
  const skew = options.clockSkewSeconds ?? 0
  const issuedAt = numberRead(claims.iat)
  const expiresAt = numberRead(claims.exp)
  const notBefore = claims.nbf === undefined ? null : numberRead(claims.nbf)
  if (issuedAt === null || expiresAt === null)
    return resultErrorCreate(op, "The JWT time claims were missing or invalid")
  if (expiresAt <= now - skew) return resultErrorCreate(op, "The JWT has expired")
  if (issuedAt > now + skew || expiresAt <= issuedAt) return resultErrorCreate(op, "The JWT issue time was invalid")
  if (claims.nbf !== undefined && notBefore === null)
    return resultErrorCreate(op, "The JWT not-before claim was invalid")
  if (notBefore !== null && notBefore > now + skew) return resultErrorCreate(op, "The JWT is not active yet")

  const organizationClaimValues = [
    claims["urn:zitadel:iam:org:id"],
    claims["urn:zitadel:iam:user:resourceowner:id"],
    claims.organization_id,
    claims.org_id,
    claims.organizationId,
    claims.orgId,
  ]
  const presentOrganizationClaimValues = organizationClaimValues.filter((value) => value !== undefined)
  const hasOrganizationClaim = presentOrganizationClaimValues.length > 0
  const roleOrgs = isRecord(claims["urn:zitadel:iam:org:project:roles"])
    ? Object.values(claims["urn:zitadel:iam:org:project:roles"]).flatMap((v) =>
        isRecord(v) ? Object.keys(v) : stringArrayRead(v),
      )
    : []
  let claimedOrganizationId: string | null
  if (options.method === "human_session") {
    const parsedOrganizationClaimValues = presentOrganizationClaimValues.map(stringRead)
    const claimedOrganization = parsedOrganizationClaimValues[0]
    const allowedOrganizationIds = options.allowedOrganizationIds ?? [options.organizationId]
    if (
      claimedOrganization === undefined ||
      claimedOrganization === null ||
      parsedOrganizationClaimValues.some((value) => value !== claimedOrganization) ||
      !allowedOrganizationIds.includes(claimedOrganization)
    ) {
      return resultErrorCreate(op, "The JWT organization was invalid", {
        foundOrganizationId: presentOrganizationClaimValues,
        expectedOrganizationId: allowedOrganizationIds,
        claims,
      })
    }
    // ZITADEL's resourceowner:id claim identifies the user's organization; context aliases alone do not establish
    // owner organization membership.
    const ownerOrganizationIds = options.ownerOrganizationIds ?? [options.organizationId]
    if (
      ownerOrganizationIds.includes(claimedOrganization) &&
      stringRead(claims["urn:zitadel:iam:user:resourceowner:id"]) !== claimedOrganization
    ) {
      return resultErrorCreate(op, "The JWT organization was invalid", {
        foundOrganizationId: presentOrganizationClaimValues,
        expectedOrganizationId: claimedOrganization,
        claims,
      })
    }
    claimedOrganizationId = claimedOrganization
  } else {
    const allowedOrganizationIds = options.allowedOrganizationIds ?? [options.organizationId]
    if (
      hasOrganizationClaim &&
      presentOrganizationClaimValues.some((value) => {
        const parsed = stringRead(value)
        return parsed === null || !allowedOrganizationIds.includes(parsed)
      })
    )
      return resultErrorCreate(op, "The JWT organization was invalid", {
        foundOrganizationId: presentOrganizationClaimValues,
        expectedOrganizationId: allowedOrganizationIds,
        claims,
      })
    const claimedOrg = hasOrganizationClaim
      ? (presentOrganizationClaimValues
          .map(stringRead)
          .find((value): value is string => value !== null && allowedOrganizationIds.includes(value)) ?? null)
      : null
    claimedOrganizationId =
      claimedOrg ??
      roleOrgs.find((org) => allowedOrganizationIds.includes(org)) ??
      (roleOrgs.length === 0 && allowedOrganizationIds.length === 1 ? allowedOrganizationIds[0] : null) ??
      null
    if (claimedOrganizationId === null || !allowedOrganizationIds.includes(claimedOrganizationId))
      return resultErrorCreate(op, "The JWT organization was invalid", {
        foundOrganizationId: claimedOrganizationId,
        expectedOrganizationId: allowedOrganizationIds,
        claims,
      })
  }
  const organizationId = claimedOrganizationId ?? options.organizationId
  const ownerOrganizationIds = options.ownerOrganizationIds ?? [options.organizationId]
  const customerOrganizationIds =
    options.customerOrganizationIds ?? (options.customerOrganizationId ? [options.customerOrganizationId] : [])
  const mode = ownerOrganizationIds.includes(organizationId)
    ? "admin"
    : customerOrganizationIds.includes(organizationId)
      ? "contributor"
      : null
  if (mode === null) return resultErrorCreate(op, "The JWT organization was invalid")
  const grants = jwtProjectGrantsRead(claims, organizationId, options.defaultProjectId)
  if (options.method === "service_account" && grants.length === 0)
    return resultErrorCreate(op, "The JWT did not contain the required project grant")
  if (
    options.requiredProjectId !== undefined &&
    !grants.some((grant) => grant.projectId === options.requiredProjectId)
  ) {
    return resultErrorCreate(op, "The JWT did not contain the required project grant")
  }
  const validated = v.safeParse(authenticatedPrincipalSchema, {
    subjectId,
    organizationId,
    mode,
    organizationAdmin: false,
    method: options.method,
    grants,
    issuedAt,
    expiresAt,
  })
  if (!validated.success) return resultErrorCreate(op, "The JWT did not contain an allowed project grant")
  return { success: true, data: validated.output }
}
