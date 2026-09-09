import * as v from "valibot"

import { type AuthenticationRole, authenticationRoleSchema } from "./authenticationRoleSchema.js"
import type { ProjectGrant } from "./projectGrantSchema.js"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const stringRead = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null)

const stringArrayRead = (value: unknown): string[] => {
  if (typeof value === "string" && value.length > 0) return [value]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.length > 0)
}

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

export const jwtProjectGrantsRead = (
  claims: Record<string, unknown>,
  organizationId: string,
  defaultProjectId?: string,
): ProjectGrant[] => {
  const grants = new Map<string, Set<AuthenticationRole>>()
  const tokenOrgId =
    stringRead(claims["urn:zitadel:iam:org:id"]) ?? stringRead(claims["urn:zitadel:iam:user:resourceowner:id"])
  const customClaim = claims.assets_project_grants
  if (isRecord(customClaim)) {
    if (isRecord(customClaim[organizationId])) {
      for (const [projectId, value] of Object.entries(customClaim[organizationId])) {
        grantAdd(grants, projectId, rolesRead(value))
      }
    } else if (tokenOrgId === organizationId) {
      for (const [projectId, value] of Object.entries(customClaim)) {
        if (!isRecord(value) && !Array.isArray(value)) continue
        grantAdd(grants, projectId, rolesRead(value))
      }
    }
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
  if (!isRecord(projectRoles)) {
    return [...grants].map(([projectId, roles]) => ({ projectId, roles: [...roles].sort() }))
  }
  const hasProjectMap = Object.values(projectRoles).some(
    (value) => Array.isArray(value) || (isRecord(value) && value.roles !== undefined),
  )
  if (hasProjectMap && tokenOrgId === organizationId) {
    for (const [projectId, value] of Object.entries(projectRoles)) grantAdd(grants, projectId, rolesRead(value))
    return [...grants].map(([projectId, roles]) => ({ projectId, roles: [...roles].sort() }))
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
  return [...grants].map(([projectId, roles]) => ({ projectId, roles: [...roles].sort() }))
}
