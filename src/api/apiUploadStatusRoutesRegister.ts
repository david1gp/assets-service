import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import * as v from "valibot"

import { uploadListQuerySchema } from "../api-client/uploadListQuerySchema.js"
import type { UploadApiRepository } from "../upload/uploadApiRepository.js"
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

export const apiUploadStatusRoutesRegister = (
  app: ApiApp,
  options: {
    repository?: UploadApiRepository
    authenticationMiddleware: MiddlewareHandler<ApiContext>
    uploaderMiddleware: MiddlewareHandler<ApiContext>
  },
): void => {
  const prefix = "/api/v1/projects/:projectId/uploads"
  const configuredRead = (context: { get: (key: string) => unknown }) =>
    options.repository?.uploadsRead === undefined
      ? failureResponseCreate(context, 500, "not_configured", "The upload status API is not configured")
      : null

  app.get(prefix, options.authenticationMiddleware, options.uploaderMiddleware, (context) => {
    const missing = configuredRead(context)
    if (missing) return missing
    const projectId = projectIdRead(context)
    const parsed = v.safeParse(
      uploadListQuerySchema,
      Object.fromEntries(new URL(context.req.url).searchParams.entries()),
    )
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (!parsed.success)
      return failureResponseCreate(context, 400, "validation_failed", "The upload list query was invalid")
    const uploads = options.repository?.uploadsRead?.(projectId, parsed.output)
    if (uploads === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The upload status API is not configured")
    if (!uploads.success) return failureResponseCreate(context, 500, "internal_error", "The uploads could not be read")
    return successResponseCreate(context, {
      uploads: uploads.data.items,
      page: {
        limit: parsed.output.limit ?? 50,
        nextCursor: uploads.data.nextCursor === null ? null : String(uploads.data.nextCursor),
      },
    })
  })

  app.get(`${prefix}/:uploadId`, options.authenticationMiddleware, options.uploaderMiddleware, (context) => {
    const projectId = projectIdRead(context)
    const uploadId = idRead(context, "uploadId")
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (uploadId === null)
      return failureResponseCreate(context, 400, "validation_failed", "The upload identifier was invalid")
    const upload = options.repository?.uploadRead?.(projectId, uploadId)
    if (upload === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The upload status API is not configured")
    if (!upload.success) return failureResponseCreate(context, 500, "internal_error", "The upload could not be read")
    if (upload.data === null) return failureResponseCreate(context, 404, "not_found", "The upload was not found")
    return successResponseCreate(context, upload.data)
  })
}
