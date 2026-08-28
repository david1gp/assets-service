import type { ProjectBinding } from "../project/projectBindingSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { AuthenticatedPrincipal } from "./authenticatedPrincipalSchema.js"
import type { AuthenticationRole } from "./authenticationRoleSchema.js"
import type { AuthenticationMethod } from "./authenticationMethodSchema.js"

export const projectAuthorizationCheck = (
  principal: AuthenticatedPrincipal,
  binding: ProjectBinding,
  requiredRole: AuthenticationRole,
  serviceProjectId: string,
  requiredMethod?: AuthenticationMethod,
): Result<true> => {
  const op = "projectAuthorizationCheck"
  if (requiredMethod !== undefined && principal.method !== requiredMethod)
    return resultErrorCreate(op, "The authentication method was not allowed for this route")
  if (principal.organizationId !== binding.organizationId)
    return resultErrorCreate(op, "The organization grant was invalid")
  if (binding.serviceProjectId !== serviceProjectId)
    return resultErrorCreate(op, "The service project binding was invalid")
  if (principal.organizationAdmin) return { success: true, data: true }
  const grant = principal.grants.find((candidate) => candidate.projectId === binding.zitadelProjectId)
  if (!grant) return resultErrorCreate(op, "The Zitadel project grant was missing")
  const isAdmin = grant.roles.includes("admin") || (grant.roles as readonly string[]).includes("assets.admin")
  const isContributor =
    isAdmin || grant.roles.includes("contributor") || (grant.roles as readonly string[]).includes("assets.uploader")
  if (requiredRole === "admin" && !isAdmin) {
    return resultErrorCreate(op, "The admin role was required")
  }
  if (requiredRole === "contributor" && !isContributor) {
    return resultErrorCreate(op, "The contributor role was required")
  }
  return { success: true, data: true }
}
