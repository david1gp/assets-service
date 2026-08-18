import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { RequestAuthentication } from "./requestAuthenticationSchema.js"
import { serviceBearerValidate } from "./serviceBearerValidate.js"
import type { ServiceBearerValidateOptions } from "./serviceBearerValidateOptions.js"
import { sessionCookieCreate } from "./sessionCookieCreate.js"
import { sessionCookieRead } from "./sessionCookieRead.js"
import type { SessionStore } from "./sessionStore.js"

type RequestAuthenticationReadOptions = {
  sessionStore: SessionStore
  sessionCookieName: string
  sessionRotationSeconds: number
  serviceBearer?: ServiceBearerValidateOptions
  now?: () => number
}

export const requestAuthenticationRead = async (
  request: Request,
  options: RequestAuthenticationReadOptions,
): Promise<Result<RequestAuthentication>> => {
  const authorization = request.headers.get("authorization")
  if (authorization) {
    if (!options.serviceBearer)
      return resultErrorCreate("requestAuthenticationRead", "Service authentication is not configured")
    const principal = await serviceBearerValidate(request, options.serviceBearer)
    if (!principal.success) return principal
    return { success: true, data: { principal: principal.data } }
  }

  const sessionId = sessionCookieRead(request, options.sessionCookieName)
  if (!sessionId) return resultErrorCreate("requestAuthenticationRead", "Authentication was missing")
  const session = await options.sessionStore.read(sessionId)
  if (!session.success) return session
  if (!session.data) return resultErrorCreate("requestAuthenticationRead", "The session was not found")
  const now = Math.floor((options.now ?? (() => Date.now()))() / 1000)
  if (session.data.expiresAt <= now || session.data.principal.expiresAt <= now) {
    await options.sessionStore.revoke(sessionId)
    return resultErrorCreate("requestAuthenticationRead", "The session has expired")
  }
  if (session.data.rotateAt > now) return { success: true, data: { principal: session.data.principal } }

  const rotatedSession = {
    ...session.data,
    rotateAt: Math.min(now + options.sessionRotationSeconds, session.data.expiresAt),
  }
  const nextSessionId = await options.sessionStore.rotate(sessionId, rotatedSession)
  if (!nextSessionId.success) return nextSessionId
  const sessionCookie = sessionCookieCreate(nextSessionId.data, {
    name: options.sessionCookieName,
    maxAgeSeconds: session.data.expiresAt - now,
  })
  return { success: true, data: { principal: rotatedSession.principal, sessionCookie } }
}
