import { requestAuthenticationRead } from "../authentication/requestAuthenticationRead.js"
import type { RequestAuthentication } from "../authentication/requestAuthenticationSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ApiAuthenticationOptions } from "./apiAuthenticationOptions.js"

export const apiRequestAuthenticationRead = async (
  request: Request,
  options: ApiAuthenticationOptions,
): Promise<Result<RequestAuthentication>> =>
  requestAuthenticationRead(request, {
    sessionStore: options.sessionStore,
    sessionCookieName: options.config.sessionCookieName,
    sessionRotationSeconds: options.config.sessionRotationSeconds,
    serviceBearer: options.serviceBearer,
    now: options.now,
  }).catch((error: unknown) =>
    resultErrorCreate("apiRequestAuthenticationRead", "Authentication could not be read", error),
  )
