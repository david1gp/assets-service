import type { Result } from "../schemas/resultSchema.js"
import type { AuthenticatedPrincipal } from "./authenticatedPrincipalSchema.js"
import type { RequestAuthentication } from "./requestAuthenticationSchema.js"

type ProtectedRequestHandler = (request: Request, principal: AuthenticatedPrincipal) => Promise<Response>
type ProtectedRequestBoundaryOptions = {
  authenticationRead: (request: Request) => Promise<Result<RequestAuthentication>>
  authorizationCheck: (request: Request, principal: AuthenticatedPrincipal) => Promise<Result<true>>
}

const failureResponseCreate = (status: 401 | 403): Response =>
  Response.json({ error: status === 401 ? "unauthorized" : "forbidden" }, { status })

export const protectedRequestBoundaryCreate = (options: ProtectedRequestBoundaryOptions) => {
  return async (request: Request, handler: ProtectedRequestHandler): Promise<Response> => {
    const authentication = await options.authenticationRead(request)
    if (!authentication.success) return failureResponseCreate(401)
    const authorization = await options.authorizationCheck(request, authentication.data.principal)
    if (!authorization.success) return failureResponseCreate(403)

    const response = await handler(request, authentication.data.principal)
    if (!authentication.data.sessionCookie) return response
    const headers = new Headers(response.headers)
    headers.append("Set-Cookie", authentication.data.sessionCookie)
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
}
