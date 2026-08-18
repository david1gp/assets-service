import type { ProjectBinding } from "../project/projectBindingSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { AuthenticatedPrincipal } from "./authenticatedPrincipalSchema.js"
import type { AuthenticationRole } from "./authenticationRoleSchema.js"
import type { AuthenticationMethod } from "./authenticationMethodSchema.js"
import { projectAuthorizationCheck } from "./projectAuthorizationCheck.js"
import { protectedRequestBoundaryCreate } from "./protectedRequestBoundaryCreate.js"
import type { RequestAuthentication } from "./requestAuthenticationSchema.js"

type ProjectProtectedRequestBoundaryOptions = {
  authenticationRead: (request: Request) => Promise<Result<RequestAuthentication>>
  bindingRead: (request: Request) => Promise<Result<ProjectBinding>>
  requiredRole: AuthenticationRole
  serviceProjectId: string
  requiredMethod?: AuthenticationMethod
}

export const projectProtectedRequestBoundaryCreate = (options: ProjectProtectedRequestBoundaryOptions) =>
  protectedRequestBoundaryCreate({
    authenticationRead: options.authenticationRead,
    authorizationCheck: async (request: Request, principal: AuthenticatedPrincipal): Promise<Result<true>> => {
      const binding = await options.bindingRead(request)
      if (!binding.success) return binding
      return projectAuthorizationCheck(
        principal,
        binding.data,
        options.requiredRole,
        options.serviceProjectId,
        options.requiredMethod,
      )
    },
  })
