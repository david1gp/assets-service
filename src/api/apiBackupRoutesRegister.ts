import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import * as v from "valibot"

import { backupListQuerySchema } from "../api-client/backupListQuerySchema.js"
import { idSchema } from "../schemas/idSchema.js"
import type { BackupApiRepository } from "../backup/backupApiRepository.js"
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
const queryObjectRead = (request: Request): Record<string, string> =>
  Object.fromEntries(new URL(request.url).searchParams.entries())
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

export const apiBackupRoutesRegister = (
  app: ApiApp,
  options: {
    repository?: BackupApiRepository
    authenticationMiddleware: MiddlewareHandler<ApiContext>
    uploaderMiddleware: MiddlewareHandler<ApiContext>
  },
): void => {
  const prefix = "/api/v1/projects/:projectId"
  const configuredRead = (context: { get: (key: string) => unknown }) =>
    options.repository === undefined
      ? failureResponseCreate(context, 500, "not_configured", "The backup API is not configured")
      : null

  app.get(`${prefix}/backups`, options.authenticationMiddleware, options.uploaderMiddleware, (context) => {
    const missing = configuredRead(context)
    if (missing) return missing
    const projectId = projectIdRead(context)
    const parsed = v.safeParse(backupListQuerySchema, queryObjectRead(context.req.raw))
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (!parsed.success)
      return failureResponseCreate(context, 400, "validation_failed", "The backup list query was invalid")
    const receipts = options.repository?.backupReceiptsRead(projectId, parsed.output)
    if (receipts === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The backup API is not configured")
    if (!receipts.success)
      return failureResponseCreate(context, 500, "internal_error", "The backup receipts could not be read")
    return successResponseCreate(context, {
      receipts: receipts.data.items,
      page: {
        limit: parsed.output.limit ?? 50,
        nextCursor: receipts.data.nextCursor === null ? null : String(receipts.data.nextCursor),
      },
    })
  })

  const receiptHandle = (context: { req: { param: (name: string) => string }; get: (key: string) => unknown }) => {
    const missing = configuredRead(context)
    if (missing) return missing
    const projectId = projectIdRead(context)
    const receiptId = idRead(context, "backupId")
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (receiptId === null)
      return failureResponseCreate(context, 400, "validation_failed", "The backup identifier was invalid")
    const receipt = options.repository?.backupReceiptRead(projectId, receiptId)
    if (receipt === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The backup API is not configured")
    if (!receipt.success)
      return failureResponseCreate(context, 500, "internal_error", "The backup receipt could not be read")
    if (receipt.data === null)
      return failureResponseCreate(context, 404, "not_found", "The backup receipt was not found")
    return successResponseCreate(context, receipt.data)
  }
  app.get(`${prefix}/backups/:backupId`, options.authenticationMiddleware, options.uploaderMiddleware, (context) =>
    receiptHandle(context),
  )

  const statusHandle = (context: { req: { param: (name: string) => string }; get: (key: string) => unknown }) => {
    const missing = configuredRead(context)
    if (missing) return missing
    const projectId = projectIdRead(context)
    const sourceRevisionId = idRead(context, "sourceRevisionId")
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (sourceRevisionId === null)
      return failureResponseCreate(context, 400, "validation_failed", "The source revision identifier was invalid")
    const status = options.repository?.backupStatusRead(projectId, sourceRevisionId)
    if (status === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The backup API is not configured")
    if (!status.success)
      return failureResponseCreate(context, 500, "internal_error", "The backup status could not be read")
    if (status.data === null)
      return failureResponseCreate(context, 404, "not_found", "The source revision was not found")
    return successResponseCreate(context, status.data)
  }
  app.get(
    `${prefix}/source-revisions/:sourceRevisionId/backup-status`,
    options.authenticationMiddleware,
    options.uploaderMiddleware,
    (context) => statusHandle(context),
  )

  app.get(
    `/api/v1/projects/:projectId/assets/:assetId/backups`,
    options.authenticationMiddleware,
    options.uploaderMiddleware,
    (context) => {
      const missing = configuredRead(context)
      if (missing) return missing
      const projectId = projectIdRead(context)
      const assetId = idRead(context, "assetId")
      const parsed = v.safeParse(backupListQuerySchema, queryObjectRead(context.req.raw))
      if (projectId === null)
        return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
      if (assetId === null)
        return failureResponseCreate(context, 400, "validation_failed", "The asset identifier was invalid")
      if (!parsed.success)
        return failureResponseCreate(context, 400, "validation_failed", "The backup list query was invalid")
      const receipts = options.repository?.backupReceiptsRead(projectId, { ...parsed.output, assetId })
      if (receipts === undefined)
        return failureResponseCreate(context, 500, "not_configured", "The backup API is not configured")
      if (!receipts.success)
        return failureResponseCreate(context, 500, "internal_error", "The backup receipts could not be read")
      return successResponseCreate(context, {
        receipts: receipts.data.items,
        page: {
          limit: parsed.output.limit ?? 50,
          nextCursor: receipts.data.nextCursor === null ? null : String(receipts.data.nextCursor),
        },
      })
    },
  )

  app.get(
    `/api/v1/projects/:projectId/assets/:assetId/backup-status`,
    options.authenticationMiddleware,
    options.uploaderMiddleware,
    (context) => {
      const missing = configuredRead(context)
      if (missing) return missing
      const projectId = projectIdRead(context)
      const assetId = idRead(context, "assetId")
      if (projectId === null)
        return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
      if (assetId === null)
        return failureResponseCreate(context, 400, "validation_failed", "The asset identifier was invalid")
      const status = options.repository?.backupAssetStatusRead?.(projectId, assetId)
      if (status === undefined)
        return failureResponseCreate(context, 500, "not_configured", "The asset backup status is not configured")
      if (!status.success)
        return failureResponseCreate(context, 500, "internal_error", "The backup status could not be read")
      if (status.data === null) return failureResponseCreate(context, 404, "not_found", "The asset was not found")
      return successResponseCreate(context, status.data)
    },
  )
}
