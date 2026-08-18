import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import * as v from "valibot"

import { auditEventListQuerySchema } from "../api-client/auditEventListQuerySchema.js"
import type { AuditApiRepository } from "../audit/auditApiRepository.js"
import { idSchema } from "../schemas/idSchema.js"
import { apiErrorResponseCreate } from "./apiErrorResponseCreate.js"
import { apiResponseCreate } from "./apiResponseCreate.js"
import { apiSuccessEnvelopeCreate } from "./apiSuccessEnvelopeCreate.js"

type ApiContext = { Variables: Record<string, unknown> }
type ApiApp = Hono<ApiContext>
const requestIdRead = (context: { get: (key: string) => unknown }): string =>
  String(context.get("requestId") ?? "unknown")
const projectIdRead = (context: { get: (key: string) => unknown }): string | null => {
  const project = context.get("project")
  return project && typeof project === "object" && "id" in project && typeof project.id === "string" ? project.id : null
}
const successResponseCreate = (context: { get: (key: string) => unknown }, data: unknown) =>
  apiResponseCreate(apiSuccessEnvelopeCreate(data, requestIdRead(context)), {
    status: 200,
    requestId: requestIdRead(context),
  })
const failureResponseCreate = (
  context: { get: (key: string) => unknown },
  status: number,
  code: "not_found" | "validation_failed" | "not_configured" | "internal_error",
  message: string,
) => apiErrorResponseCreate({ requestId: requestIdRead(context), status, code, message, retryable: status >= 500 })
const idRead = (context: { req: { param: (name: string) => string } }, name: string): string | null => {
  const parsed = v.safeParse(idSchema, context.req.param(name))
  return parsed.success ? parsed.output : null
}

export const apiAuditRoutesRegister = (
  app: ApiApp,
  options: {
    repository?: AuditApiRepository
    authenticationMiddleware: MiddlewareHandler<ApiContext>
    adminMiddleware: MiddlewareHandler<ApiContext>
  },
): void => {
  const prefix = "/api/v1/projects/:projectId/audit-events"
  const configuredRead = (context: { get: (key: string) => unknown }) =>
    options.repository === undefined
      ? failureResponseCreate(context, 500, "not_configured", "The audit API is not configured")
      : null

  app.get(prefix, options.authenticationMiddleware, options.adminMiddleware, (context) => {
    const missing = configuredRead(context)
    if (missing) return missing
    const projectId = projectIdRead(context)
    const parsed = v.safeParse(
      auditEventListQuerySchema,
      Object.fromEntries(new URL(context.req.url).searchParams.entries()),
    )
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (!parsed.success)
      return failureResponseCreate(context, 400, "validation_failed", "The audit event query was invalid")
    const events = options.repository?.auditEventsRead(projectId, parsed.output)
    if (events === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The audit API is not configured")
    if (!events.success)
      return failureResponseCreate(context, 500, "internal_error", "The audit events could not be read")
    return successResponseCreate(context, {
      events: events.data.items,
      page: {
        limit: parsed.output.limit ?? 50,
        nextCursor: events.data.nextCursor === null ? null : String(events.data.nextCursor),
      },
    })
  })

  app.get(`${prefix}/:eventId`, options.authenticationMiddleware, options.adminMiddleware, (context) => {
    const missing = configuredRead(context)
    if (missing) return missing
    const projectId = projectIdRead(context)
    const eventId = idRead(context, "eventId")
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (eventId === null)
      return failureResponseCreate(context, 400, "validation_failed", "The audit event identifier was invalid")
    const event = options.repository?.auditEventRead(projectId, eventId)
    if (event === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The audit API is not configured")
    if (!event.success)
      return failureResponseCreate(context, 500, "internal_error", "The audit event could not be read")
    if (event.data === null) return failureResponseCreate(context, 404, "not_found", "The audit event was not found")
    return successResponseCreate(context, event.data)
  })
}
