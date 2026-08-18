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
  const grant = principal.grants.find((candidate) => candidate.projectId === binding.zitadelProjectId)
  if (!grant) return resultErrorCreate(op, "The Zitadel project grant was missing")
  if (requiredRole === "assets.admin" && !grant.roles.includes("assets.admin")) {
    return resultErrorCreate(op, "The assets.admin role was required")
  }
  if (
    requiredRole === "assets.uploader" &&
    !grant.roles.some((role) => role === "assets.uploader" || role === "assets.admin")
  ) {
    return resultErrorCreate(op, "The assets.uploader role was required")
  }
  return { success: true, data: true }
}
