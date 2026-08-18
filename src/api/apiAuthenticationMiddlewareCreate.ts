import type { MiddlewareHandler } from "hono"

import type { ApiAuthenticationOptions } from "./apiAuthenticationOptions.js"
import { apiErrorResponseCreate } from "./apiErrorResponseCreate.js"
import { apiRequestAuthenticationRead } from "./apiRequestAuthenticationRead.js"

type ApiContext = { Variables: Record<string, unknown> }

export const apiAuthenticationMiddlewareCreate =
  (options: ApiAuthenticationOptions): MiddlewareHandler<ApiContext> =>
  async (context, next) => {
    const authentication = await apiRequestAuthenticationRead(context.req.raw, options)
    if (!authentication.success) {
      const hasBearer = context.req.header("authorization") !== undefined
      return apiErrorResponseCreate({
        requestId: String(context.get("requestId") ?? "unknown"),
        status: hasBearer && !options.serviceBearer ? 503 : 401,
        code: hasBearer && !options.serviceBearer ? "not_configured" : "unauthorized",
        message:
          hasBearer && !options.serviceBearer
            ? "Service authentication is not configured"
            : "Authentication is required",
        retryable: hasBearer && !options.serviceBearer,
      })
    }

    context.set("authentication", authentication.data)
    await next()
    if (!authentication.data.sessionCookie) return
    const headers = new Headers(context.res.headers)
    headers.append("set-cookie", authentication.data.sessionCookie)
    context.res = new Response(context.res.body, {
      status: context.res.status,
      statusText: context.res.statusText,
      headers,
    })
    return undefined
  }
