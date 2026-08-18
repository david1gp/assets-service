import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import * as v from "valibot"

import type { DeletionApiRepository } from "../deletion/deletionApiRepository.js"
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

export const apiDeletionStatusRoutesRegister = (
  app: ApiApp,
  options: {
    repository?: DeletionApiRepository
    authenticationMiddleware: MiddlewareHandler<ApiContext>
    uploaderMiddleware: MiddlewareHandler<ApiContext>
  },
): void => {
  const prefix = "/api/v1/projects/:projectId/assets/:assetId"

  // An asset without a deletion request is the normal case, so the absence is
  // reported as `data: null` with 200. Answering 404 here filled the browser
  // console with errors on every asset detail view.
  const statusHandle = (context: {
    get: (key: string) => unknown
    req: { param: (name: string) => string }
  }): Response => {
    const projectId = projectIdRead(context)
    const assetId = idRead(context, "assetId")
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (assetId === null)
      return failureResponseCreate(context, 400, "validation_failed", "The asset identifier was invalid")
    const state = options.repository?.deletionStateRead?.(projectId, assetId)
    if (state === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The deletion status API is not configured")
    if (!state.success)
      return failureResponseCreate(context, 500, "internal_error", "The deletion status could not be read")
    return successResponseCreate(context, state.data)
  }

  for (const path of ["deletion-status", "deletion", "deletion-request"])
    app.get(`${prefix}/${path}`, options.authenticationMiddleware, options.uploaderMiddleware, statusHandle)
}
