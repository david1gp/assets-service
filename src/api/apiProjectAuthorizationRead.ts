import * as v from "valibot"

import type { AuthenticationRole } from "../authentication/authenticationRoleSchema.js"
import { projectAuthorizationCheck } from "../authentication/projectAuthorizationCheck.js"
import type { RequestAuthentication } from "../authentication/requestAuthenticationSchema.js"
import type { ProjectBinding } from "../project/projectBindingSchema.js"
import type { ProjectRepository } from "../project/projectRepository.js"
import type { Project } from "../project/projectSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

type ApiProjectAuthorization = { project: Project; binding: ProjectBinding; authentication: RequestAuthentication }

export const apiProjectAuthorizationRead = (
  projectIdentifier: string,
  authentication: RequestAuthentication,
  projectRepository: ProjectRepository,
  requiredRole: AuthenticationRole,
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
  )
  if (!authorization.success) return authorization
  const project = projectRepository.projectRead(binding.data.projectId)
  if (!project.success) return project
  if (!project.data) return resultErrorCreate("apiProjectAuthorizationRead", "The project was not found")
  return { success: true, data: { project: project.data, binding: binding.data, authentication } }
}
