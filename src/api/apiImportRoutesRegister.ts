import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import * as v from "valibot"

import { legacyImportListQuerySchema } from "../api-client/legacyImportListQuerySchema.js"
import { legacyImportRequestSchema } from "../api-client/legacyImportRequestSchema.js"
import type { LegacyImportExecutor } from "../import/legacyImportExecutor.js"
import { idSchema } from "../schemas/idSchema.js"
import type { RequestAuthentication } from "../authentication/requestAuthenticationSchema.js"
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
const successResponseCreate = (context: { get: (key: string) => unknown }, data: unknown, status = 200) =>
  apiResponseCreate(apiSuccessEnvelopeCreate(data, requestIdRead(context)), {
    status,
    requestId: requestIdRead(context),
  })
const failureResponseCreate = (
  context: { get: (key: string) => unknown },
  status: number,
  code: "not_found" | "validation_failed" | "not_configured" | "internal_error",
  message: string,
) => apiErrorResponseCreate({ requestId: requestIdRead(context), status, code, message, retryable: status >= 500 })
const requestBodyRead = async (request: Request): Promise<unknown> => {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}
const idRead = (context: { req: { param: (name: string) => string } }, name: string): string | null => {
  const parsed = v.safeParse(idSchema, context.req.param(name))
  return parsed.success ? parsed.output : null
}

export const apiImportRoutesRegister = (
  app: ApiApp,
  options: {
    executor?: LegacyImportExecutor
    authenticationMiddleware: MiddlewareHandler<ApiContext>
    adminMiddleware: MiddlewareHandler<ApiContext>
  },
): void => {
  const prefix = "/api/v1/projects/:projectId/imports"
  const configuredRead = (context: { get: (key: string) => unknown }) =>
    options.executor === undefined
      ? failureResponseCreate(context, 500, "not_configured", "The import executor is not configured")
      : null
  const actorIdRead = (context: { get: (key: string) => unknown }): string => {
    const authentication = context.get("authentication") as RequestAuthentication | undefined
    return authentication?.principal.subjectId ?? "unknown"
  }

  app.post(prefix, options.authenticationMiddleware, options.adminMiddleware, async (context) => {
    const missing = configuredRead(context)
    if (missing) return missing
    const projectId = projectIdRead(context)
    const parsed = v.safeParse(legacyImportRequestSchema, await requestBodyRead(context.req.raw))
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (!parsed.success)
      return failureResponseCreate(context, 400, "validation_failed", "The legacy import request was invalid")
    const imported = await options.executor?.legacyImportRequestCreate(projectId, actorIdRead(context), parsed.output)
    if (imported === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The import executor is not configured")
    if (!imported.success)
      return failureResponseCreate(context, 500, "internal_error", "The legacy import could not be requested")
    return successResponseCreate(context, { import: imported.data }, 202)
  })

  app.get(prefix, options.authenticationMiddleware, options.adminMiddleware, async (context) => {
    const missing = configuredRead(context)
    if (missing) return missing
    const projectId = projectIdRead(context)
    const parsed = v.safeParse(
      legacyImportListQuerySchema,
      Object.fromEntries(new URL(context.req.url).searchParams.entries()),
    )
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (!parsed.success)
      return failureResponseCreate(context, 400, "validation_failed", "The import list query was invalid")
    const imports = await options.executor?.legacyImportsRead?.(projectId, parsed.output)
    if (imports === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The import list is not configured")
    if (!imports.success) return failureResponseCreate(context, 500, "internal_error", "The imports could not be read")
    return successResponseCreate(context, {
      imports: imports.data.items,
      page: {
        limit: parsed.output.limit ?? 50,
        nextCursor: imports.data.nextCursor === null ? null : String(imports.data.nextCursor),
      },
    })
  })

  const statusHandle = async (context: { req: { param: (name: string) => string }; get: (key: string) => unknown }) => {
    const missing = configuredRead(context)
    if (missing) return missing
    const projectId = projectIdRead(context)
    const importId = idRead(context, "importId")
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (importId === null)
      return failureResponseCreate(context, 400, "validation_failed", "The import identifier was invalid")
    const imported = await options.executor?.legacyImportStatusRead(projectId, importId)
    if (imported === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The import executor is not configured")
    if (!imported.success)
      return failureResponseCreate(context, 500, "internal_error", "The import status could not be read")
    if (imported.data === null) return failureResponseCreate(context, 404, "not_found", "The import was not found")
    return successResponseCreate(context, { import: imported.data })
  }
  app.get(`${prefix}/:importId`, options.authenticationMiddleware, options.adminMiddleware, (context) =>
    statusHandle(context),
  )
  app.get(`${prefix}/:importId/status`, options.authenticationMiddleware, options.adminMiddleware, (context) =>
    statusHandle(context),
  )
}
