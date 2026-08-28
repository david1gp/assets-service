import * as v from "valibot"

import type { ZitadelJwksClient } from "../infrastructure/zitadel/zitadelJwksClient.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type AuthenticatedPrincipal, authenticatedPrincipalSchema } from "./authenticatedPrincipalSchema.js"
import { type AuthenticationRole, authenticationRoleSchema } from "./authenticationRoleSchema.js"
import { jwtTokenParse } from "./jwtTokenParse.js"
import { jwtTokenSignatureVerify } from "./jwtTokenSignatureVerify.js"

type JwtPrincipalValidateOptions = {
  issuer: string
  audience: string
  jwksUri?: string
  discoveryRead?: () => Promise<Result<{ issuer: string; jwks_uri: string }>>
  jwksClient: ZitadelJwksClient
  organizationId: string
  defaultProjectId?: string
  requiredClientId?: string
  requiredProjectId?: string
  allowMissingOrganizationClaim?: boolean
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

const roleRead = (value: string): AuthenticationRole | null => {
  if (value === "contributor" || value === "assets.uploader") return "contributor"
  if (value === "admin" || value === "assets.admin") return "admin"
  const parsed = v.safeParse(authenticationRoleSchema, value)
  return parsed.success ? parsed.output : null
}

const grantAdd = (grants: Map<string, Set<AuthenticationRole>>, projectId: string, roles: readonly string[]) => {
  const accepted = roles.map(roleRead).filter((role): role is AuthenticationRole => role !== null)
  if (accepted.length === 0) return
  const current = grants.get(projectId) ?? new Set<AuthenticationRole>()
  for (const role of accepted) current.add(role)
  grants.set(projectId, current)
}

const rolesRead = (value: unknown): string[] => {
  if (Array.isArray(value)) return stringArrayRead(value)
  if (!isRecord(value)) return []
  const nested = value.roles
  if (nested !== undefined) return stringArrayRead(nested)
  return Object.keys(value)
}

const projectGrantsRead = (
  claims: Record<string, unknown>,
  organizationId: string,
  defaultProjectId?: string,
): Map<string, Set<AuthenticationRole>> => {
  const grants = new Map<string, Set<AuthenticationRole>>()
  const customClaims = [claims.assets_project_grants]
  for (const claim of customClaims) {
    if (!isRecord(claim)) continue
    for (const [projectId, value] of Object.entries(claim)) grantAdd(grants, projectId, rolesRead(value))
  }

  const explicitProjectId =
    stringRead(claims.project_id) ??
    stringRead(claims.projectId) ??
    stringRead(claims["urn:zitadel:iam:org:project:id"]) ??
    defaultProjectId
  const plainRoles = stringArrayRead(claims.roles)
  if (stringRead(claims.project_id) || stringRead(claims.projectId))
    grantAdd(grants, explicitProjectId ?? "", plainRoles)

  const projectRoles = claims["urn:zitadel:iam:org:project:roles"]
  if (!isRecord(projectRoles)) return grants
  const hasProjectMap = Object.values(projectRoles).some(
    (value) => Array.isArray(value) || (isRecord(value) && value.roles !== undefined),
  )
  if (hasProjectMap) {
    for (const [projectId, value] of Object.entries(projectRoles)) grantAdd(grants, projectId, rolesRead(value))
    return grants
  }

  if (explicitProjectId) {
    const roles = Object.entries(projectRoles)
      .filter(([, value]) => {
        if (isRecord(value)) return Object.hasOwn(value, organizationId)
        return stringArrayRead(value).includes(organizationId)
      })
      .map(([role]) => role)
    grantAdd(grants, explicitProjectId, roles)
  }
  return grants
}

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
    claims["urn:zitadel:iam:user:resourceowner"],
    claims.organization_id,
    claims.org_id,
    claims.organizationId,
    claims.orgId,
  ]
  const presentOrganizationClaimValues = organizationClaimValues.filter((value) => value !== undefined)
  const hasOrganizationClaim = presentOrganizationClaimValues.length > 0
  if (
    hasOrganizationClaim &&
    presentOrganizationClaimValues.some((value) => stringRead(value) !== options.organizationId)
  )
    return resultErrorCreate(op, "The JWT organization was invalid", {
      foundOrganizationId: presentOrganizationClaimValues,
      expectedOrganizationId: options.organizationId,
      claims,
    })
  const orgClaim = hasOrganizationClaim ? options.organizationId : null
  const roleOrgs = isRecord(claims["urn:zitadel:iam:org:project:roles"])
    ? Object.values(claims["urn:zitadel:iam:org:project:roles"]).flatMap((v) =>
        isRecord(v) ? Object.keys(v) : stringArrayRead(v),
      )
    : []
  const claimedOrganizationId =
    orgClaim ?? (roleOrgs.includes(options.organizationId) ? options.organizationId : roleOrgs[0]) ?? null
  if (claimedOrganizationId === null && (options.method !== "human_session" || !options.allowMissingOrganizationClaim))
    return resultErrorCreate(op, "The JWT organization was invalid", {
      foundOrganizationId: claimedOrganizationId,
      expectedOrganizationId: options.organizationId,
      claims,
    })
  if (claimedOrganizationId !== null && claimedOrganizationId !== options.organizationId)
    return resultErrorCreate(op, "The JWT organization was invalid", {
      foundOrganizationId: claimedOrganizationId,
      expectedOrganizationId: options.organizationId,
      claims,
    })
  const organizationId = claimedOrganizationId ?? options.organizationId
  const grants = [...projectGrantsRead(claims, organizationId, options.defaultProjectId)].map(([projectId, roles]) => ({
    projectId,
    roles: [...roles].sort(),
  }))
  if (options.method === "service_account" && grants.length === 0)
    return resultErrorCreate(op, "The JWT did not contain the required project grant")
  if (
    options.requiredProjectId !== undefined &&
    !grants.some((grant) => grant.projectId === options.requiredProjectId)
  ) {
    return resultErrorCreate(op, "The JWT did not contain the required project grant")
  }
  const isContentorenOrg =
    organizationId === "380716752838852623" ||
    organizationId.toLowerCase() === "contentoren" ||
    options.organizationId === "380716752838852623" ||
    options.organizationId.toLowerCase() === "contentoren"
  const organizationAdmin = options.method === "human_session" && isContentorenOrg
  const validated = v.safeParse(authenticatedPrincipalSchema, {
    subjectId,
    organizationId,
    organizationAdmin,
    method: options.method,
    grants,
    issuedAt,
    expiresAt,
  })
  if (!validated.success) return resultErrorCreate(op, "The JWT did not contain an allowed project grant")
  return { success: true, data: validated.output }
}
