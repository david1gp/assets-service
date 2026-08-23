import type { MiddlewareHandler } from "hono"
import { Hono } from "hono"
import * as v from "valibot"

import { assetStructureFolderMembershipSetRequestSchema } from "../api-client/assetStructureFolderMembershipSetRequestSchema.js"
import { structureResponseSchema } from "../api-client/structureResponseSchema.js"
import type { AssetApiRepository } from "../asset/assetApiRepository.js"
import { idSchema } from "../schemas/idSchema.js"
import { assetStructureFolderMembershipSchema } from "../structure/assetStructureFolderMembershipSchema.js"
import { structureFolderCreateInputSchema } from "../structure/structureFolderCreateInputSchema.js"
import { structureFolderSchema } from "../structure/structureFolderSchema.js"
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

const requestBodyRead = async (request: Request): Promise<unknown> => {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

const successResponseCreate = (context: { get: (key: string) => unknown }, data: unknown, status = 200) =>
  apiResponseCreate(apiSuccessEnvelopeCreate(data, requestIdRead(context)), {
    status,
    requestId: requestIdRead(context),
  })

const failureResponseCreate = (
  context: { get: (key: string) => unknown },
  status: number,
  code: "conflict" | "internal_error" | "not_configured" | "not_found" | "validation_failed",
  message: string,
) => apiErrorResponseCreate({ requestId: requestIdRead(context), status, code, message, retryable: status >= 500 })

const repositoryFailureResponseCreate = (context: { get: (key: string) => unknown }, errorMessage: string) => {
  const notFound = /not found|does not exist|disappeared/i.test(errorMessage)
  const conflict = /already in use|cannot be|deeper than|descendant/i.test(errorMessage)
  return failureResponseCreate(
    context,
    notFound ? 404 : conflict ? 409 : 500,
    notFound ? "not_found" : conflict ? "conflict" : "internal_error",
    notFound
      ? "The requested structure resource was not found"
      : conflict
        ? "The requested structure change conflicts with existing data"
        : "The structure resource could not be read",
  )
}

const idRead = (context: { req: { param: (name: string) => string } }, name: string): string | null => {
  const parsed = v.safeParse(idSchema, context.req.param(name))
  return parsed.success ? parsed.output : null
}

export const apiStructureRoutesRegister = (
  app: ApiApp,
  options: {
    repository?: AssetApiRepository
    authenticationMiddleware: MiddlewareHandler<ApiContext>
    uploaderMiddleware: MiddlewareHandler<ApiContext>
    adminMiddleware: MiddlewareHandler<ApiContext>
  },
): void => {
  const prefix = "/api/v1/projects/:projectId"

  app.get(`${prefix}/structure`, options.authenticationMiddleware, options.uploaderMiddleware, (context) => {
    const repository = options.repository
    if (repository?.structureRead === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The structure API is not configured")
    const projectId = projectIdRead(context)
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    const structure = repository.structureRead(projectId)
    if (!structure.success) return repositoryFailureResponseCreate(context, structure.errorMessage)
    const parsed = v.safeParse(structureResponseSchema, structure.data)
    if (!parsed.success)
      return failureResponseCreate(context, 500, "internal_error", "The structure response was invalid")
    return successResponseCreate(context, parsed.output)
  })

  app.post(
    `${prefix}/structure/folders`,
    options.authenticationMiddleware,
    options.adminMiddleware,
    async (context) => {
      const repository = options.repository
      if (repository?.structureFolderCreate === undefined)
        return failureResponseCreate(context, 500, "not_configured", "The structure API is not configured")
      const projectId = projectIdRead(context)
      if (projectId === null)
        return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
      const body = await requestBodyRead(context.req.raw)
      const parsedBody = v.safeParse(structureFolderCreateInputSchema, body)
      if (!parsedBody.success)
        return failureResponseCreate(context, 400, "validation_failed", "The structure folder request was invalid")
      const created = repository.structureFolderCreate(projectId, parsedBody.output)
      if (!created.success) return repositoryFailureResponseCreate(context, created.errorMessage)
      const parsedFolder = v.safeParse(structureFolderSchema, created.data)
      if (!parsedFolder.success)
        return failureResponseCreate(context, 500, "internal_error", "The structure folder response was invalid")
      return successResponseCreate(context, parsedFolder.output, 201)
    },
  )

  app.put(
    `${prefix}/assets/:assetId/structure-membership`,
    options.authenticationMiddleware,
    options.adminMiddleware,
    async (context) => {
      const repository = options.repository
      if (repository?.assetStructureFolderMembershipSet === undefined)
        return failureResponseCreate(context, 500, "not_configured", "The structure API is not configured")
      const projectId = projectIdRead(context)
      const assetId = idRead(context, "assetId")
      if (projectId === null)
        return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
      if (assetId === null)
        return failureResponseCreate(context, 400, "validation_failed", "The asset identifier was invalid")
      const body = await requestBodyRead(context.req.raw)
      const parsedBody = v.safeParse(assetStructureFolderMembershipSetRequestSchema, body)
      if (!parsedBody.success)
        return failureResponseCreate(context, 400, "validation_failed", "The structure membership request was invalid")
      const asset = repository.assetRead(projectId, assetId)
      if (!asset.success) return repositoryFailureResponseCreate(context, asset.errorMessage)
      if (asset.data === null) return failureResponseCreate(context, 404, "not_found", "The asset was not found")
      const membership = repository.assetStructureFolderMembershipSet(
        projectId,
        assetId,
        parsedBody.output.structureFolderId,
      )
      if (!membership.success) return repositoryFailureResponseCreate(context, membership.errorMessage)
      if (membership.data === null) return successResponseCreate(context, null)
      const parsedMembership = v.safeParse(assetStructureFolderMembershipSchema, membership.data)
      if (!parsedMembership.success)
        return failureResponseCreate(context, 500, "internal_error", "The structure membership response was invalid")
      return successResponseCreate(context, parsedMembership.output)
    },
  )
}
