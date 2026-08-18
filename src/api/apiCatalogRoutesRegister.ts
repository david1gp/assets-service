import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import * as v from "valibot"

import { catalogListQuerySchema } from "../api-client/catalogListQuerySchema.js"
import { manifestListQuerySchema } from "../api-client/manifestListQuerySchema.js"
import type { CatalogApiRepository } from "../catalog/catalogApiRepository.js"
import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
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
const environmentRead = (context: {
  req: { param: (name: string) => string }
}): "development" | "production" | null => {
  const parsed = v.safeParse(environmentNameSchema, context.req.param("environment"))
  return parsed.success ? parsed.output : null
}

export const apiCatalogRoutesRegister = (
  app: ApiApp,
  options: {
    repository?: CatalogApiRepository
    authenticationMiddleware: MiddlewareHandler<ApiContext>
    uploaderMiddleware: MiddlewareHandler<ApiContext>
  },
): void => {
  const prefix = "/api/v1/projects/:projectId"
  const configuredRead = (context: { get: (key: string) => unknown }) =>
    options.repository === undefined
      ? failureResponseCreate(context, 500, "not_configured", "The catalog API is not configured")
      : null

  const currentHandle = (context: { req: { param: (name: string) => string }; get: (key: string) => unknown }) => {
    const missing = configuredRead(context)
    if (missing) return missing
    const projectId = projectIdRead(context)
    const environment = environmentRead(context)
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (environment === null)
      return failureResponseCreate(context, 400, "validation_failed", "The catalog environment was invalid")
    const catalog = options.repository?.catalogCurrentRead(projectId, environment)
    if (catalog === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The catalog API is not configured")
    if (!catalog.success)
      return failureResponseCreate(context, 500, "internal_error", "The current catalog could not be read")
    if (catalog.data === null)
      return failureResponseCreate(context, 404, "not_found", "The current catalog was not found")
    return successResponseCreate(context, catalog.data)
  }
  app.get(`${prefix}/catalogs/:environment`, options.authenticationMiddleware, options.uploaderMiddleware, (context) =>
    currentHandle(context),
  )
  app.get(
    `${prefix}/catalogs/:environment/current`,
    options.authenticationMiddleware,
    options.uploaderMiddleware,
    (context) => currentHandle(context),
  )

  app.get(
    `${prefix}/catalogs/:environment/history`,
    options.authenticationMiddleware,
    options.uploaderMiddleware,
    (context) => {
      const missing = configuredRead(context)
      if (missing) return missing
      const projectId = projectIdRead(context)
      const environment = environmentRead(context)
      const query = v.safeParse(catalogListQuerySchema, queryObjectRead(context.req.raw))
      if (projectId === null)
        return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
      if (environment === null)
        return failureResponseCreate(context, 400, "validation_failed", "The catalog environment was invalid")
      if (!query.success)
        return failureResponseCreate(context, 400, "validation_failed", "The catalog history query was invalid")
      const catalogs = options.repository?.catalogsRead(projectId, environment, query.output)
      if (catalogs === undefined)
        return failureResponseCreate(context, 500, "not_configured", "The catalog API is not configured")
      if (!catalogs.success)
        return failureResponseCreate(context, 500, "internal_error", "The catalog history could not be read")
      return successResponseCreate(context, {
        catalogs: catalogs.data.items,
        page: {
          limit: query.output.limit ?? 50,
          nextCursor: catalogs.data.nextCursor === null ? null : String(catalogs.data.nextCursor),
        },
      })
    },
  )

  const generationHandle = (context: { req: { param: (name: string) => string }; get: (key: string) => unknown }) => {
    const missing = configuredRead(context)
    if (missing) return missing
    const projectId = projectIdRead(context)
    const generationId = idRead(context, "generationId")
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (generationId === null)
      return failureResponseCreate(context, 400, "validation_failed", "The catalog generation identifier was invalid")
    const catalog = options.repository?.catalogRead(projectId, generationId)
    if (catalog === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The catalog API is not configured")
    if (!catalog.success) return failureResponseCreate(context, 500, "internal_error", "The catalog could not be read")
    if (catalog.data === null)
      return failureResponseCreate(context, 404, "not_found", "The catalog generation was not found")
    return successResponseCreate(context, catalog.data)
  }
  app.get(
    `${prefix}/catalogs/:environment/generations/:generationId`,
    options.authenticationMiddleware,
    options.uploaderMiddleware,
    (context) => generationHandle(context),
  )

  app.get(
    `${prefix}/catalogs/:environment/lists`,
    options.authenticationMiddleware,
    options.uploaderMiddleware,
    (context) => {
      const missing = configuredRead(context)
      if (missing) return missing
      const projectId = projectIdRead(context)
      const environment = environmentRead(context)
      const query = v.safeParse(catalogListQuerySchema, queryObjectRead(context.req.raw))
      if (projectId === null)
        return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
      if (environment === null)
        return failureResponseCreate(context, 400, "validation_failed", "The catalog environment was invalid")
      if (!query.success)
        return failureResponseCreate(context, 400, "validation_failed", "The generated list query was invalid")
      const lists = options.repository?.catalogListsRead(projectId, environment, query.output)
      if (lists === undefined)
        return failureResponseCreate(context, 500, "not_configured", "The catalog API is not configured")
      if (!lists.success)
        return failureResponseCreate(context, 500, "internal_error", "The generated lists could not be read")
      if (lists.data === null) return failureResponseCreate(context, 404, "not_found", "The catalog was not found")
      return successResponseCreate(context, lists.data)
    },
  )

  app.get(
    `${prefix}/catalogs/:environment/generations/:generationId/lists`,
    options.authenticationMiddleware,
    options.uploaderMiddleware,
    (context) => {
      const missing = configuredRead(context)
      if (missing) return missing
      const projectId = projectIdRead(context)
      const environment = environmentRead(context)
      const generationId = idRead(context, "generationId")
      if (projectId === null)
        return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
      if (environment === null)
        return failureResponseCreate(context, 400, "validation_failed", "The catalog environment was invalid")
      if (generationId === null)
        return failureResponseCreate(context, 400, "validation_failed", "The catalog generation identifier was invalid")
      const lists = options.repository?.catalogListsRead(projectId, environment, { generationId })
      if (lists === undefined)
        return failureResponseCreate(context, 500, "not_configured", "The catalog API is not configured")
      if (!lists.success)
        return failureResponseCreate(context, 500, "internal_error", "The generated lists could not be read")
      if (lists.data === null) return failureResponseCreate(context, 404, "not_found", "The catalog was not found")
      return successResponseCreate(context, lists.data)
    },
  )

  const manifestsHandle = (context: { req: { raw: Request }; get: (key: string) => unknown }) => {
    const missing = configuredRead(context)
    if (missing) return missing
    const projectId = projectIdRead(context)
    const query = v.safeParse(manifestListQuerySchema, queryObjectRead(context.req.raw))
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (!query.success)
      return failureResponseCreate(context, 400, "validation_failed", "The manifest list query was invalid")
    const manifests = options.repository?.manifestsRead(projectId, query.output)
    if (manifests === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The catalog API is not configured")
    if (!manifests.success)
      return failureResponseCreate(context, 500, "internal_error", "The manifests could not be read")
    return successResponseCreate(context, {
      manifests: manifests.data.items,
      page: {
        limit: query.output.limit ?? 50,
        nextCursor: manifests.data.nextCursor === null ? null : String(manifests.data.nextCursor),
      },
    })
  }
  app.get(`${prefix}/manifests`, options.authenticationMiddleware, options.uploaderMiddleware, (context) =>
    manifestsHandle(context),
  )
  app.get(
    `${prefix}/catalogs/:environment/manifests`,
    options.authenticationMiddleware,
    options.uploaderMiddleware,
    (context) => manifestsHandle(context),
  )

  const manifestHandle = (context: { req: { param: (name: string) => string }; get: (key: string) => unknown }) => {
    const missing = configuredRead(context)
    if (missing) return missing
    const projectId = projectIdRead(context)
    const manifestId = idRead(context, "manifestId")
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (manifestId === null)
      return failureResponseCreate(context, 400, "validation_failed", "The manifest identifier was invalid")
    const manifest = options.repository?.manifestRead(projectId, manifestId)
    if (manifest === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The catalog API is not configured")
    if (!manifest.success)
      return failureResponseCreate(context, 500, "internal_error", "The manifest could not be read")
    if (manifest.data === null) return failureResponseCreate(context, 404, "not_found", "The manifest was not found")
    return successResponseCreate(context, manifest.data)
  }
  app.get(`${prefix}/manifests/:manifestId`, options.authenticationMiddleware, options.uploaderMiddleware, (context) =>
    manifestHandle(context),
  )
}
