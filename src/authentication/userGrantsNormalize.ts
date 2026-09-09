import * as v from "valibot"

import { type AuthenticationRole, authenticationRoleSchema } from "./authenticationRoleSchema.js"
import type { ProjectGrant } from "./projectGrantSchema.js"
import type { UserGrantsNormalizeOptions } from "./userGrantsNormalizeOptions.js"
import type { ZitadelUserGrant } from "../infrastructure/zitadel/zitadelUserGrantSchema.js"

const roleNormalize = (role: string): AuthenticationRole | null => {
  if (role === "assets.uploader" || role === "contributor") return "contributor"
  if (role === "assets.admin" || role === "admin") return "admin"
  return v.is(authenticationRoleSchema, role) ? role : null
}

export const userGrantsNormalize = (
  userGrants: readonly ZitadelUserGrant[],
  options: UserGrantsNormalizeOptions,
): ProjectGrant[] => {
  const allowedOrgs = options.organizationId !== undefined ? [options.organizationId] : options.allowedOrganizationIds

  const grantMap = new Map<string, Set<AuthenticationRole>>()

  for (const grant of userGrants) {
    if (grant.state !== "USER_GRANT_STATE_ACTIVE") continue
    if (allowedOrgs !== undefined && !allowedOrgs.includes(grant.orgId)) {
      continue
    }

    const rawRoles = [...(grant.roleKeys ?? []), ...(grant.roles ?? [])]
    const normalizedRoles = rawRoles.map(roleNormalize).filter((role): role is AuthenticationRole => role !== null)

    const acceptedRoles =
      options.allowedRoles !== undefined
        ? normalizedRoles.filter((role) => options.allowedRoles!.includes(role))
        : normalizedRoles

    if (acceptedRoles.length === 0) continue

    const current = grantMap.get(grant.projectId) ?? new Set<AuthenticationRole>()
    for (const role of acceptedRoles) {
      current.add(role)
    }
    grantMap.set(grant.projectId, current)
  }

  return [...grantMap.entries()].map(([projectId, rolesSet]) => ({
    projectId,
    roles: [...rolesSet].sort(),
  }))
}
