import type { MiddlewareHandler } from "hono"

import type { AuthenticationRole } from "../authentication/authenticationRoleSchema.js"
import type { RequestAuthentication } from "../authentication/requestAuthenticationSchema.js"
import type { ProjectRepository } from "../project/projectRepository.js"
import { apiErrorResponseCreate } from "./apiErrorResponseCreate.js"
import { apiProjectAuthorizationRead } from "./apiProjectAuthorizationRead.js"

type ApiContext = { Variables: Record<string, unknown> }

export const apiProjectRoleMiddlewareCreate =
  (options: {
    projectRepository: ProjectRepository
    requiredRole: AuthenticationRole
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
    const authorization = apiProjectAuthorizationRead(
      context.req.param("projectId") ?? "",
      authentication,
      options.projectRepository,
      options.requiredRole,
    )
    if (!authorization.success) {
      const invalidIdentifier = authorization.errorMessage === "The project identifier was invalid"
      const notFound = authorization.errorMessage === "The project was not found"
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
