import type { MiddlewareHandler } from "hono"

import type { AuthenticationRole } from "../authentication/authenticationRoleSchema.js"
import type { RequestAuthentication } from "../authentication/requestAuthenticationSchema.js"
import type { ZitadelOrganizationMapping } from "../authentication/zitadelOrganizationMappingSchema.js"
import type { ProjectRepository } from "../project/projectRepository.js"
import { apiErrorResponseCreate } from "./apiErrorResponseCreate.js"
import { apiProjectAuthorizationRead } from "./apiProjectAuthorizationRead.js"
import { apiProjectAuthorizationReadBySlugs } from "./apiProjectAuthorizationReadBySlugs.js"

type ApiContext = { Variables: Record<string, unknown> }

export const apiProjectRoleMiddlewareCreate =
  (options: {
    projectRepository: ProjectRepository
    requiredRole: AuthenticationRole
    organizationId?: string
    customerOrganizationId?: string
    organizationMappings?: readonly ZitadelOrganizationMapping[]
  }): MiddlewareHandler<ApiContext> =>
  async (context, next) => {
    const authentication = context.get("authentication") as RequestAuthentication | undefined
    if (!authentication) {
      return apiErrorResponseCreate({
        requestId: String(context.get("requestId") ?? "unknown"),
        status: 401,
        code: "unauthorized",
        message: "Authentication is required",
      })
    }
    const scope = {
      organizationId: options.organizationId,
      customerOrganizationId: options.customerOrganizationId,
      organizationMappings: options.organizationMappings,
    }
    const organizationSlug = context.req.param("orgSlug")
    const projectSlug = context.req.param("projectSlug")
    const authorization =
      organizationSlug !== undefined && projectSlug !== undefined
        ? apiProjectAuthorizationReadBySlugs(
            organizationSlug,
            projectSlug,
            authentication,
            options.projectRepository,
            options.requiredRole,
            scope,
          )
        : apiProjectAuthorizationRead(
            context.req.param("projectId") ?? "",
            authentication,
            options.projectRepository,
            options.requiredRole,
            scope,
          )
    if (!authorization.success) {
      const invalidIdentifier =
        authorization.errorMessage === "The project identifier was invalid" ||
        authorization.errorMessage === "The organization slug was invalid" ||
        authorization.errorMessage === "The project slug was invalid"
      const notFound = /was not found$/.test(authorization.errorMessage)
      const technical = authorization.op.startsWith("projectRepository")
      return apiErrorResponseCreate({
        requestId: String(context.get("requestId") ?? "unknown"),
        status: technical ? 500 : invalidIdentifier ? 400 : notFound ? 404 : 403,
        code: technical
          ? "internal_error"
          : invalidIdentifier
            ? "validation_failed"
            : notFound
              ? "not_found"
              : "forbidden",
        message: technical
          ? "The project could not be read"
          : invalidIdentifier
            ? "The project identifier was invalid"
            : notFound
              ? "The project was not found"
              : "The project role was not allowed",
        retryable: technical,
      })
    }
    context.set("project", authorization.data.project)
    context.set("binding", authorization.data.binding)
    await next()
    return undefined
  }
