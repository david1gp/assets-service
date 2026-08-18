import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { AuthenticatedPrincipal } from "./authenticatedPrincipalSchema.js"
import { jwtPrincipalValidate } from "./jwtPrincipalValidate.js"
import { servicePatPrincipalValidate } from "./servicePatPrincipalValidate.js"
import type { ServiceBearerValidateOptions } from "./serviceBearerValidateOptions.js"

export const serviceBearerValidate = async (
  request: Request,
  options: ServiceBearerValidateOptions,
): Promise<Result<AuthenticatedPrincipal>> => {
  const header = request.headers.get("authorization")
  if (!header) return resultErrorCreate("serviceBearerValidate", "The bearer token was missing")
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim())
  if (!match?.[1]) return resultErrorCreate("serviceBearerValidate", "The authorization header was invalid")

  const token = match[1]
  if (token.split(".").length !== 3) {
    return servicePatPrincipalValidate(token, {
      issuer: options.issuer,
      organizationId: options.organizationId,
      projectId: options.projectId,
      fetcher: options.patFetcher,
      now: options.now,
    })
  }

  const principal = await jwtPrincipalValidate(token, {
    issuer: options.issuer,
    audience: options.audience,
    jwksUri: options.jwksUri,
    jwksClient: options.jwksClient,
    discoveryRead: options.discoveryRead,
    organizationId: options.organizationId,
    defaultProjectId: options.defaultProjectId,
    requiredClientId: options.serviceAccountClientId,
    requiredProjectId: options.projectId,
    method: "service_account",
    now: options.now,
    clockSkewSeconds: options.clockSkewSeconds,
  })
  if (!principal.success) return principal
  return principal
}
