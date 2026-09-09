import type { ProjectBinding } from "../project/projectBindingSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { AuthenticatedPrincipal } from "./authenticatedPrincipalSchema.js"
import type { AuthenticationRole } from "./authenticationRoleSchema.js"
import type { AuthenticationMethod } from "./authenticationMethodSchema.js"
import type { ZitadelOrganizationMapping } from "./zitadelOrganizationMappingSchema.js"

type ProjectAuthorizationScope = {
  organizationId?: string
  customerOrganizationId?: string
  organizationMappings?: readonly ZitadelOrganizationMapping[]
}

export const projectAuthorizationCheck = (
  principal: AuthenticatedPrincipal,
  binding: ProjectBinding,
  requiredRole: AuthenticationRole,
  serviceProjectId: string,
  requiredMethod?: AuthenticationMethod,
  scope: ProjectAuthorizationScope = {},
): Result<true> => {
  const op = "projectAuthorizationCheck"
  if (requiredMethod !== undefined && principal.method !== requiredMethod)
    return resultErrorCreate(op, "The authentication method was not allowed for this route")

  let isOwner: boolean
  let isCustomer: boolean
  if (scope.organizationMappings && scope.organizationMappings.length > 0) {
    const mapping = scope.organizationMappings.find(
      (candidate) => candidate.ownerOrganizationId === binding.organizationId,
    )
    if (!mapping) return resultErrorCreate(op, "The organization grant was invalid")
    isOwner = principal.organizationId === binding.organizationId
    isCustomer =
      principal.method === "human_session" &&
      Boolean(mapping.customerOrganizationId) &&
      principal.organizationId === mapping.customerOrganizationId
  } else {
    const ownerOrganizationId = scope.organizationId ?? binding.organizationId
    if (binding.organizationId !== ownerOrganizationId)
      return resultErrorCreate(op, "The organization grant was invalid")
    isOwner = principal.organizationId === ownerOrganizationId
    isCustomer =
      principal.method === "human_session" &&
      scope.customerOrganizationId !== undefined &&
      principal.organizationId === scope.customerOrganizationId
  }

  if (!isOwner && !isCustomer) return resultErrorCreate(op, "The organization grant was invalid")
  if (binding.serviceProjectId !== serviceProjectId)
    return resultErrorCreate(op, "The service project binding was invalid")
  if (isCustomer && requiredRole === "admin") return resultErrorCreate(op, "The admin role was required")
  if (isOwner && principal.method === "human_session" && principal.organizationAdmin)
    return { success: true, data: true }
  const grant = principal.grants.find((candidate) => candidate.projectId === binding.zitadelProjectId)
  if (!grant) return resultErrorCreate(op, "The Zitadel project grant was missing")
  const isAdmin =
    !isCustomer && (grant.roles.includes("admin") || (grant.roles as readonly string[]).includes("assets.admin"))
  const isContributor = isCustomer
    ? grant.roles.includes("contributor")
    : isAdmin || grant.roles.includes("contributor") || (grant.roles as readonly string[]).includes("assets.uploader")
  if (requiredRole === "admin" && !isAdmin) {
    return resultErrorCreate(op, "The admin role was required")
  }
  if (requiredRole === "contributor" && !isContributor) {
    return resultErrorCreate(op, "The contributor role was required")
  }
  return { success: true, data: true }
}
