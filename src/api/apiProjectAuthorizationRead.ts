import * as v from "valibot"

import type { AuthenticationRole } from "../authentication/authenticationRoleSchema.js"
import { projectAuthorizationCheck } from "../authentication/projectAuthorizationCheck.js"
import type { RequestAuthentication } from "../authentication/requestAuthenticationSchema.js"
import type { ProjectBinding } from "../project/projectBindingSchema.js"
import type { ProjectRepository } from "../project/projectRepository.js"
import type { Project } from "../project/projectSchema.js"
import type { ZitadelOrganizationMapping } from "../authentication/zitadelOrganizationMappingSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

type ApiProjectAuthorization = { project: Project; binding: ProjectBinding; authentication: RequestAuthentication }
type ApiProjectAuthorizationScope = {
  organizationId?: string
  customerOrganizationId?: string
  organizationMappings?: readonly ZitadelOrganizationMapping[]
}

const projectArchiveAccessAllowed = (
  project: Project,
  binding: ProjectBinding,
  authentication: RequestAuthentication,
  scope: ApiProjectAuthorizationScope,
): boolean => {
  if (project.archiveState === undefined || project.archiveState === "active") return true
  const mapping = scope.organizationMappings?.find(
    (candidate) => candidate.ownerOrganizationId === binding.organizationId,
  )
  const customerOrganizationId = mapping?.customerOrganizationId ?? scope.customerOrganizationId
  const isCustomer =
    authentication.principal.method === "human_session" &&
    customerOrganizationId !== undefined &&
    authentication.principal.organizationId === customerOrganizationId
  if (isCustomer) return false
  if (
    authentication.principal.method === "human_session" &&
    authentication.principal.organizationAdmin &&
    authentication.principal.organizationId === binding.organizationId
  )
    return true
  const grant = authentication.principal.grants.find((candidate) => candidate.projectId === binding.zitadelProjectId)
  return (
    grant?.roles.includes("admin") === true ||
    (grant?.roles as readonly string[] | undefined)?.includes("assets.admin") === true
  )
}

export const apiProjectAuthorizationRead = (
  projectIdentifier: string,
  authentication: RequestAuthentication,
  projectRepository: ProjectRepository,
  requiredRole: AuthenticationRole,
  scope: ApiProjectAuthorizationScope = {},
): Result<ApiProjectAuthorization> => {
  const parsedIdentifier = v.safeParse(idSchema, projectIdentifier)
  if (!parsedIdentifier.success)
    return resultErrorCreate("apiProjectAuthorizationRead", "The project identifier was invalid")
  const binding = projectRepository.projectBindingRead(parsedIdentifier.output)
  if (!binding.success) return binding
  if (!binding.data) return resultErrorCreate("apiProjectAuthorizationRead", "The project was not found")
  const authorization = projectAuthorizationCheck(
    authentication.principal,
    binding.data,
    requiredRole,
    binding.data.serviceProjectId,
    undefined,
    scope,
  )
  if (!authorization.success) return authorization
  const project = projectRepository.projectRead(binding.data.projectId)
  if (!project.success) return project
  if (!project.data) return resultErrorCreate("apiProjectAuthorizationRead", "The project was not found")
  if (project.data.organizationId !== binding.data.organizationId)
    return resultErrorCreate("apiProjectAuthorizationRead", "The project binding was invalid")
  if (!projectArchiveAccessAllowed(project.data, binding.data, authentication, scope))
    return resultErrorCreate("apiProjectAuthorizationRead", "The archived project was not available")
  return { success: true, data: { project: project.data, binding: binding.data, authentication } }
}
