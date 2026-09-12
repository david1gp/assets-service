import * as v from "valibot"

import type { AuthenticationRole } from "../authentication/authenticationRoleSchema.js"
import type { RequestAuthentication } from "../authentication/requestAuthenticationSchema.js"
import type { ZitadelOrganizationMapping } from "../authentication/zitadelOrganizationMappingSchema.js"
import type { ProjectRepository } from "../project/projectRepository.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import { apiProjectAuthorizationRead } from "./apiProjectAuthorizationRead.js"

type ApiProjectAuthorizationReadBySlugsResult = ReturnType<typeof apiProjectAuthorizationRead>
type ApiProjectAuthorizationScope = {
  organizationId?: string
  customerOrganizationId?: string
  organizationMappings?: readonly ZitadelOrganizationMapping[]
}

const slugSchema = v.pipe(v.string(), v.slug())

export const apiProjectAuthorizationReadBySlugs = (
  organizationSlug: string,
  projectSlug: string,
  authentication: RequestAuthentication,
  projectRepository: ProjectRepository,
  requiredRole: AuthenticationRole,
  scope: ApiProjectAuthorizationScope = {},
): ApiProjectAuthorizationReadBySlugsResult => {
  const op = "apiProjectAuthorizationReadBySlugs"
  const parsedOrganizationSlug = v.safeParse(slugSchema, organizationSlug)
  if (!parsedOrganizationSlug.success) return resultErrorCreate(op, "The organization slug was invalid")
  const parsedProjectSlug = v.safeParse(slugSchema, projectSlug)
  if (!parsedProjectSlug.success) return resultErrorCreate(op, "The project slug was invalid")

  const organization = projectRepository.organizationReadBySlug(parsedOrganizationSlug.output)
  if (!organization.success) return organization
  if (!organization.data) return resultErrorCreate(op, "The organization was not found")

  const project = projectRepository.projectReadByOrganizationIdAndSlug(organization.data.id, parsedProjectSlug.output)
  if (!project.success) return project
  if (!project.data) return resultErrorCreate(op, "The project was not found")

  return apiProjectAuthorizationRead(project.data.id, authentication, projectRepository, requiredRole, scope)
}
