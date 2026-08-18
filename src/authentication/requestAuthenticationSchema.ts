import type { AuthenticatedPrincipal } from "./authenticatedPrincipalSchema.js"

export type RequestAuthentication = {
  principal: AuthenticatedPrincipal
  sessionCookie?: string
}
