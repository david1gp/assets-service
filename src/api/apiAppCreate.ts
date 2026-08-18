import { Hono } from "hono"
import * as v from "valibot"
import { assetListQuerySchema } from "../api-client/assetListQuerySchema.js"
import { deleteAssetRequestSchema } from "../api-client/deleteAssetRequestSchema.js"
import { metadataSetRequestSchema } from "../api-client/metadataSetRequestSchema.js"
import { metadataUnsetRequestSchema } from "../api-client/metadataUnsetRequestSchema.js"
import { moveAssetRequestSchema } from "../api-client/moveAssetRequestSchema.js"
import { outputAddRequestSchema } from "../api-client/outputAddRequestSchema.js"
import { outputRemoveRequestSchema } from "../api-client/outputRemoveRequestSchema.js"
import { outputSetRequestSchema } from "../api-client/outputSetRequestSchema.js"
import { projectListQuerySchema } from "../api-client/projectListQuerySchema.js"
import { uploadCompletionRequestSchema } from "../api-client/uploadCompletionRequestSchema.js"
import { uploadIntentRequestSchema } from "../api-client/uploadIntentRequestSchema.js"
import { uploadMediaTypeCheck } from "../upload/uploadMediaTypeCheck.js"
import type { AssetApiMutation } from "../asset/assetApiRepository.js"
import { assetFilenameSchema } from "../asset/assetFilenameSchema.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import { humanLoginCallback } from "../authentication/humanLoginCallback.js"
import { humanLoginInitiate } from "../authentication/humanLoginInitiate.js"
import { pkceCallbackRequestSchema } from "../authentication/pkceCallbackRequestSchema.js"
import { pkceLoginRequestSchema } from "../authentication/pkceLoginRequestSchema.js"
import type { RequestAuthentication } from "../authentication/requestAuthenticationSchema.js"
import { sessionCookieCreate } from "../authentication/sessionCookieCreate.js"
import { sessionCookieRead } from "../authentication/sessionCookieRead.js"
import type { Project } from "../project/projectSchema.js"
import { projectSettingsUpdateSchema } from "../project/projectSettingsUpdateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ApiAppOptions } from "./apiAppOptions.js"
import { apiAuditRoutesRegister } from "./apiAuditRoutesRegister.js"
import { apiAuthenticationMiddlewareCreate } from "./apiAuthenticationMiddlewareCreate.js"
import { apiBackupRoutesRegister } from "./apiBackupRoutesRegister.js"
import { apiCatalogRoutesRegister } from "./apiCatalogRoutesRegister.js"
import { apiDeletionStatusRoutesRegister } from "./apiDeletionStatusRoutesRegister.js"
import { apiErrorResponseCreate } from "./apiErrorResponseCreate.js"
import { apiImportRoutesRegister } from "./apiImportRoutesRegister.js"
import { apiProjectRoleMiddlewareCreate } from "./apiProjectRoleMiddlewareCreate.js"
import { apiRequestAuthenticationRead } from "./apiRequestAuthenticationRead.js"
import { apiRequestIdCreate } from "./apiRequestIdCreate.js"
import { apiResponseCreate } from "./apiResponseCreate.js"
import { apiSuccessEnvelopeCreate } from "./apiSuccessEnvelopeCreate.js"
import { apiUploadStatusRoutesRegister } from "./apiUploadStatusRoutesRegister.js"
import { apiWorkflowRoutesRegister } from "./apiWorkflowRoutesRegister.js"
import { apiSourceRevisionDeletionEligibilityRoutesRegister } from "./apiSourceRevisionDeletionEligibilityRoutesRegister.js"

type ApiContext = { Variables: Record<string, unknown> }
type ApiApplication = Hono<ApiContext>
type ApiHeaders = Record<string, string> | Headers

const apiVersionPath = "/api/v1"

const requestIdRead = (context: { get: (key: string) => unknown }): string =>
  String(context.get("requestId") ?? "unknown")

const successResponseCreate = (
  context: { get: (key: string) => unknown },
  data: unknown,
  status = 200,
  headers?: ApiHeaders,
) =>
  apiResponseCreate(apiSuccessEnvelopeCreate(data, requestIdRead(context)), {
    status,
    requestId: requestIdRead(context),
    headers,
  })

const failureFromRepositoryCreate = (context: { get: (key: string) => unknown }) =>
  apiErrorResponseCreate({
    requestId: requestIdRead(context),
    status: 500,
    code: "internal_error",
    message: "The requested resource could not be read",
    retryable: true,
  })

const validationFailureCreate = (context: { get: (key: string) => unknown }, message: string) =>
  apiErrorResponseCreate({
    requestId: requestIdRead(context),
    status: 400,
    code: "validation_failed",
    message,
  })

const dependencyFailureCreate = (context: { get: (key: string) => unknown }) =>
  apiErrorResponseCreate({
    requestId: requestIdRead(context),
    status: 500,
    code: "not_configured",
    message: "The requested API operation is not configured",
    retryable: true,
  })

const requestBodyRead = async (request: Request): Promise<unknown | undefined> => {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

const assetNotFoundResponseCreate = (context: { get: (key: string) => unknown }) =>
  apiErrorResponseCreate({
    requestId: requestIdRead(context),
    status: 404,
    code: "not_found",
    message: "The asset was not found",
  })

const domainFailureResponseCreate = (context: { get: (key: string) => unknown }, errorMessage: string) => {
  const notFound = /not found|does not exist|disappeared/i.test(errorMessage)
  const conflict = /already|must retain|must have|cannot have|different request|cannot be resumed|not available/i.test(
    errorMessage,
  )
  const validation =
    /invalid|must be|requires|only one|exactly one|unique|does not match|not allowed|could not be detected/i.test(
      errorMessage,
    )
  const status = notFound ? 404 : conflict ? 409 : validation ? 400 : 500
  const code =
    status === 404 ? "not_found" : status === 409 ? "conflict" : status === 400 ? "validation_failed" : "internal_error"
  const message =
    status === 404
      ? "The requested resource was not found"
      : status === 409
        ? "The requested change conflicts with existing data"
        : status === 400
          ? "The request was invalid"
          : "The requested operation could not be completed"
  return apiErrorResponseCreate({ requestId: requestIdRead(context), status, code, message, retryable: status === 500 })
}

const mutationAssetRead = (mutation: AssetApiMutation) => mutation.asset

const outputMutationResponseCreate = (context: { get: (key: string) => unknown }, mutation: AssetApiMutation) =>
  successResponseCreate(context, {
    outputs: mutationAssetRead(mutation).outputHistory.map((history) => history.definition),
    ...(mutation.workflowId === undefined ? {} : { workflowId: mutation.workflowId }),
  })

const moveTargetRead = (
  input: import("../api-client/moveAssetRequestSchema.js").MoveAssetRequest,
): Result<{ folders: import("../asset/foldersSchema.js").Folders; filename: string }> => {
  if (input.folders !== undefined && input.filename !== undefined)
    return { success: true, data: { folders: input.folders, filename: input.filename } }
  const path = input.to ?? input.path
  if (path === undefined) return resultErrorCreate("apiMoveTargetRead", "The move target was invalid")
  if (path.includes("\\")) return resultErrorCreate("apiMoveTargetRead", "The move target was invalid")
  const segments = path.split("/")
  const filename = segments.pop()
  if (filename === undefined || filename.length === 0)
    return resultErrorCreate("apiMoveTargetRead", "The move target was invalid")
  const folders = v.safeParse(foldersSchema, segments)
  if (!folders.success) return resultErrorCreate("apiMoveTargetRead", "The move folders were invalid", folders.issues)
  const parsedFilename = v.safeParse(assetFilenameSchema, filename)
  if (!parsedFilename.success)
    return resultErrorCreate("apiMoveTargetRead", "The move filename was invalid", parsedFilename.issues)
  return { success: true, data: { folders: folders.output, filename: parsedFilename.output } }
}

const queryObjectRead = (request: Request): Record<string, string> => {
  const query = new URL(request.url).searchParams
  return Object.fromEntries(query.entries())
}

const redirectResponseCreate = (context: { get: (key: string) => unknown }, location: string, cookies: string[]) => {
  const headers = new Headers({ location, "x-request-id": requestIdRead(context) })
  for (const cookie of cookies) headers.append("set-cookie", cookie)
  return new Response(null, { status: 302, headers })
}

const responseCookieAppend = (response: Response, cookie: string): Response => {
  const headers = new Headers(response.headers)
  headers.append("set-cookie", cookie)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const projectRead = (context: { get: (key: string) => unknown }): Project | null => {
  const project = context.get("project")
  return project && typeof project === "object" ? (project as Project) : null
}

const knownRouteMethodsRead = (path: string): readonly string[] | null => {
  const routes: readonly { pattern: RegExp; methods: readonly string[] }[] = [
    { pattern: /^\/api\/v1\/(health|ready)$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/health\/(live|ready|readiness)$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/readiness$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/auth\/(login|callback|session)$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/auth\/logout$/, methods: ["POST"] },
    { pattern: /^\/api\/v1\/projects$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/settings$/, methods: ["GET", "PUT"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/environments$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/environments\/[^/]+$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/environments\/[^/]+\/settings$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/uploads\/intent$/, methods: ["POST"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/uploads\/[^/]+\/complete$/, methods: ["POST"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/uploads$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/uploads\/[^/]+$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/assets$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+\/history$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+\/outputs$/, methods: ["GET", "POST", "PUT", "DELETE"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+\/outputs\/[^/]+$/, methods: ["DELETE"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+\/metadata$/, methods: ["PATCH", "DELETE"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+\/metadata\/[^/]+$/, methods: ["DELETE"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+\/metadata\/unset$/, methods: ["POST"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+\/move$/, methods: ["POST"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+\/deletion-request$/, methods: ["GET", "POST"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+\/(deletion|deletion-status)$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/(workflows|jobs)$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/(workflows|jobs)\/[^/]+$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/(workflows|jobs)\/[^/]+\/status$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/(workflows|jobs)\/[^/]+\/(retry|cancel)$/, methods: ["POST"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/backups$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/backups\/[^/]+$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/source-revisions\/[^/]+\/backup-status$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/source-revisions\/[^/]+\/deletion-eligibility$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+\/backups$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/assets\/[^/]+\/backup-status$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/catalogs\/[^/]+$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/catalogs\/[^/]+\/(current|history|lists|manifests)$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/catalogs\/[^/]+\/generations\/[^/]+$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/catalogs\/[^/]+\/generations\/[^/]+\/lists$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/manifests$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/manifests\/[^/]+$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/imports$/, methods: ["GET", "POST"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/imports\/[^/]+$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/imports\/[^/]+\/status$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/audit-events$/, methods: ["GET"] },
    { pattern: /^\/api\/v1\/projects\/[^/]+\/audit-events\/[^/]+$/, methods: ["GET"] },
  ]
  return routes.find((route) => route.pattern.test(path))?.methods ?? null
}

export const apiAppCreate = (options: ApiAppOptions): ApiApplication => {
  const app = new Hono<ApiContext>()
  const authenticationMiddleware = apiAuthenticationMiddlewareCreate(options.authentication)
  const uploaderMiddleware = apiProjectRoleMiddlewareCreate({
    projectRepository: options.projectRepository,
    requiredRole: "assets.uploader",
  })
  const adminMiddleware = apiProjectRoleMiddlewareCreate({
    projectRepository: options.projectRepository,
    requiredRole: "assets.admin",
  })

  const metadataUnsetHandle = (
    context: { get: (key: string) => unknown; req: { param: (name: string) => string } },
    fieldOverride?: string,
  ) => {
    if (options.assetApiRepository === undefined) return dependencyFailureCreate(context)
    const assetId = v.safeParse(idSchema, context.req.param("assetId"))
    const field = v.safeParse(metadataUnsetRequestSchema, { field: fieldOverride ?? context.req.param("field") })
    if (!assetId.success || !field.success) return validationFailureCreate(context, "The metadata field was invalid")
    const project = projectRead(context)
    if (!project) return failureFromRepositoryCreate(context)
    const mutation = options.assetApiRepository.assetMetadataUnset(project.id, assetId.output, field.output.field)
    if (!mutation.success) return domainFailureResponseCreate(context, mutation.errorMessage)
    if (mutation.data === null) return assetNotFoundResponseCreate(context)
    return successResponseCreate(context, mutation.data.asset)
  }

  const readinessRead = async (): Promise<Result<true>> => {
    try {
      return await (options.readinessCheck ?? (() => ({ success: true as const, data: true })))()
    } catch (error) {
      return resultErrorCreate("apiReadinessRead", "The readiness check failed", error)
    }
  }

  app.use("*", async (context, next) => {
    const requestId = (options.requestIdCreate ?? apiRequestIdCreate)(context.req.raw)
    context.set("requestId", requestId)
    await next()
    const headers = new Headers(context.res.headers)
    headers.set("x-request-id", requestId)
    context.res = new Response(context.res.body, {
      status: context.res.status,
      statusText: context.res.statusText,
      headers,
    })
  })

  app.get(`${apiVersionPath}/health`, (context) => successResponseCreate(context, { status: "ok" }))

  app.get(`${apiVersionPath}/ready`, async (context) => {
    const readiness = await readinessRead()
    if (!readiness.success) {
      return apiErrorResponseCreate({
        requestId: requestIdRead(context),
        status: 503,
        code: "service_unavailable",
        message: "The service is not ready",
        retryable: true,
      })
    }
    return successResponseCreate(context, { status: "ready" })
  })

  app.get(`${apiVersionPath}/auth/login`, async (context) => {
    const parsed = v.safeParse(pkceLoginRequestSchema, queryObjectRead(context.req.raw))
    if (!parsed.success) return validationFailureCreate(context, "The login request was invalid")
    const initiation = await humanLoginInitiate(parsed.output, {
      config: options.authentication.config,
      stateStore: options.authentication.stateStore,
      oidcClient: options.authentication.oidcClient,
      now: options.authentication.now,
    })
    if (!initiation.success) {
      return apiErrorResponseCreate({
        requestId: requestIdRead(context),
        status: 502,
        code: "upstream_failure",
        message: "The login provider could not be reached",
        retryable: true,
      })
    }
    if (context.req.header("accept")?.includes("application/json")) {
      return successResponseCreate(context, { authorizationUrl: initiation.data.authorizationUrl })
    }
    return redirectResponseCreate(context, initiation.data.authorizationUrl, [initiation.data.stateCookie])
  })

  app.get(`${apiVersionPath}/auth/callback`, async (context) => {
    const parsed = v.safeParse(pkceCallbackRequestSchema, queryObjectRead(context.req.raw))
    if (!parsed.success) return validationFailureCreate(context, "The login callback was invalid")
    const callback = await humanLoginCallback(
      parsed.output,
      sessionCookieRead(context.req.raw, options.authentication.config.stateCookieName),
      {
        config: options.authentication.config,
        stateStore: options.authentication.stateStore,
        sessionStore: options.authentication.sessionStore,
        oidcClient: options.authentication.oidcClient,
        jwksClient: options.authentication.jwksClient,
        now: options.authentication.now,
      },
    )
    if (!callback.success) {
      return apiErrorResponseCreate({
        requestId: requestIdRead(context),
        status: 401,
        code: "unauthorized",
        message: "The login callback could not be accepted",
      })
    }
    if (context.req.header("accept")?.includes("application/json")) {
      return successResponseCreate(context, { authenticated: true, principal: callback.data.principal }, 200, {
        "set-cookie": callback.data.sessionCookie,
      })
    }
    return redirectResponseCreate(context, callback.data.returnTo, [
      callback.data.sessionCookie,
      callback.data.stateCookieClear,
    ])
  })

  app.post(`${apiVersionPath}/auth/logout`, async (context) => {
    const sessionId = sessionCookieRead(context.req.raw, options.authentication.config.sessionCookieName)
    if (sessionId) {
      const revoked = await options.authentication.sessionStore.revoke(sessionId)
      if (!revoked.success) return failureFromRepositoryCreate(context)
    }
    const clearCookie = sessionCookieCreate("", {
      name: options.authentication.config.sessionCookieName,
      maxAgeSeconds: 0,
    })
    return successResponseCreate(context, { loggedOut: true }, 200, { "set-cookie": clearCookie })
  })

  app.get(`${apiVersionPath}/auth/session`, async (context) => {
    const authentication = await apiRequestAuthenticationRead(context.req.raw, options.authentication)
    if (!authentication.success) {
      const hasAuthorization = context.req.header("authorization") !== undefined
      if (hasAuthorization && !options.authentication.serviceBearer) {
        return apiErrorResponseCreate({
          requestId: requestIdRead(context),
          status: 503,
          code: "not_configured",
          message: "Service authentication is not configured",
          retryable: true,
        })
      }
      if (hasAuthorization) {
        return apiErrorResponseCreate({
          requestId: requestIdRead(context),
          status: 401,
          code: "unauthorized",
          message: "Authentication is invalid",
        })
      }
      const response = successResponseCreate(context, { authenticated: false, principal: null })
      return response
    }
    const response = successResponseCreate(context, {
      authenticated: true,
      principal: authentication.data.principal,
    })
    return authentication.data.sessionCookie
      ? responseCookieAppend(response, authentication.data.sessionCookie)
      : response
  })

  app.get(`${apiVersionPath}/projects`, authenticationMiddleware, async (context) => {
    const authentication = context.get("authentication") as RequestAuthentication | undefined
    if (!authentication)
      return apiErrorResponseCreate({
        requestId: requestIdRead(context),
        status: 401,
        code: "unauthorized",
        message: "Authentication is required",
      })
    const parsedQuery = v.safeParse(projectListQuerySchema, queryObjectRead(context.req.raw))
    if (!parsedQuery.success) return validationFailureCreate(context, "The project list query was invalid")
    const projects = options.projectRepository.projectsRead(
      authentication.principal.organizationId,
      authentication.principal.grants.map((grant) => grant.projectId),
    )
    if (!projects.success) return failureFromRepositoryCreate(context)
    const search = parsedQuery.output.search?.toLocaleLowerCase()
    const filtered =
      search === undefined
        ? projects.data
        : projects.data.filter((item) => `${item.name} ${item.slug}`.toLocaleLowerCase().includes(search))
    const offset = parsedQuery.output.cursor ?? 0
    const limit = Math.min(100, Math.max(1, parsedQuery.output.limit ?? 50))
    const selected = filtered.slice(offset, offset + limit + 1)
    return successResponseCreate(context, {
      projects: selected.slice(0, limit),
      page: { limit, nextCursor: selected.length > limit ? String(offset + limit) : null },
    })
  })

  app.get(`${apiVersionPath}/projects/:projectId`, authenticationMiddleware, uploaderMiddleware, (context) => {
    const project = projectRead(context)
    if (!project) return failureFromRepositoryCreate(context)
    return successResponseCreate(context, project)
  })

  app.get(`${apiVersionPath}/projects/:projectId/settings`, authenticationMiddleware, adminMiddleware, (context) => {
    const settings = options.projectRepository.projectSettingsRead(context.req.param("projectId"))
    if (!settings.success) return failureFromRepositoryCreate(context)
    if (!settings.data) {
      return apiErrorResponseCreate({
        requestId: requestIdRead(context),
        status: 404,
        code: "not_found",
        message: "The project was not found",
      })
    }
    return successResponseCreate(context, settings.data)
  })

  app.put(
    `${apiVersionPath}/projects/:projectId/settings`,
    authenticationMiddleware,
    adminMiddleware,
    async (context) => {
      const body = await requestBodyRead(context.req.raw)
      const parsed = v.safeParse(projectSettingsUpdateSchema, body)
      if (!parsed.success) return validationFailureCreate(context, "The project settings were invalid")
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const settings = options.projectRepository.projectSettingsWrite(project.id, parsed.output)
      if (!settings.success) return domainFailureResponseCreate(context, settings.errorMessage)
      if (!settings.data) {
        return apiErrorResponseCreate({
          requestId: requestIdRead(context),
          status: 404,
          code: "not_found",
          message: "The project was not found",
        })
      }
      return successResponseCreate(context, settings.data)
    },
  )

  app.get(
    `${apiVersionPath}/projects/:projectId/environments`,
    authenticationMiddleware,
    uploaderMiddleware,
    (context) => {
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const environments = options.projectRepository.environmentsRead(project.id)
      if (!environments.success) return failureFromRepositoryCreate(context)
      return successResponseCreate(context, { environments: environments.data })
    },
  )

  app.get(
    `${apiVersionPath}/projects/:projectId/environments/:environment`,
    authenticationMiddleware,
    uploaderMiddleware,
    (context) => {
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const parsedEnvironment = v.safeParse(idSchema, context.req.param("environment"))
      if (!parsedEnvironment.success) return validationFailureCreate(context, "The environment identifier was invalid")
      const environment = options.projectRepository.environmentRead(project.id, parsedEnvironment.output)
      if (!environment.success) return failureFromRepositoryCreate(context)
      if (!environment.data) {
        return apiErrorResponseCreate({
          requestId: requestIdRead(context),
          status: 404,
          code: "not_found",
          message: "The environment was not found",
        })
      }
      return successResponseCreate(context, environment.data)
    },
  )

  app.get(
    `${apiVersionPath}/projects/:projectId/environments/:environment/settings`,
    authenticationMiddleware,
    adminMiddleware,
    (context) => {
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const parsedEnvironment = v.safeParse(idSchema, context.req.param("environment"))
      if (!parsedEnvironment.success) return validationFailureCreate(context, "The environment identifier was invalid")
      const environment = options.projectRepository.environmentRead(project.id, parsedEnvironment.output)
      if (!environment.success) return failureFromRepositoryCreate(context)
      if (!environment.data) {
        return apiErrorResponseCreate({
          requestId: requestIdRead(context),
          status: 404,
          code: "not_found",
          message: "The environment was not found",
        })
      }
      return successResponseCreate(context, environment.data)
    },
  )

  app.post(
    `${apiVersionPath}/projects/:projectId/uploads/intent`,
    authenticationMiddleware,
    uploaderMiddleware,
    async (context) => {
      if (options.uploadApiRepository === undefined) return dependencyFailureCreate(context)
      const body = await requestBodyRead(context.req.raw)
      const parsed = v.safeParse(uploadIntentRequestSchema, body)
      if (!parsed.success) return validationFailureCreate(context, "The upload intent was invalid")
      const mediaType = uploadMediaTypeCheck(parsed.output.mediaType)
      if (!mediaType.success) return validationFailureCreate(context, mediaType.errorMessage)
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const environment = options.projectRepository.environmentRead(
        project.id,
        parsed.output.environment ?? project.defaultEnvironment,
      )
      if (!environment.success) return failureFromRepositoryCreate(context)
      if (!environment.data)
        return apiErrorResponseCreate({
          requestId: requestIdRead(context),
          status: 404,
          code: "not_found",
          message: "The upload environment was not found",
        })
      const authentication = context.get("authentication") as RequestAuthentication | undefined
      const binding = context.get("binding") as { zitadelProjectId?: string } | undefined
      const grant = authentication?.principal.grants.find(
        (candidate) => candidate.projectId === binding?.zitadelProjectId,
      )
      const uploaderId =
        grant?.roles.includes("assets.uploader") && !grant.roles.includes("assets.admin")
          ? authentication?.principal.subjectId
          : undefined
      const intent = await options.uploadApiRepository.uploadIntentCreate(
        project.id,
        environment.data,
        parsed.output,
        uploaderId,
      )
      if (!intent.success) return domainFailureResponseCreate(context, intent.errorMessage)
      return successResponseCreate(context, intent.data, 201)
    },
  )

  app.post(
    `${apiVersionPath}/projects/:projectId/uploads/:uploadId/complete`,
    authenticationMiddleware,
    uploaderMiddleware,
    async (context) => {
      if (options.uploadApiRepository === undefined) return dependencyFailureCreate(context)
      const uploadId = v.safeParse(idSchema, context.req.param("uploadId"))
      if (!uploadId.success) return validationFailureCreate(context, "The upload identifier was invalid")
      const body = await requestBodyRead(context.req.raw)
      const parsed = v.safeParse(uploadCompletionRequestSchema, body)
      if (!parsed.success) return validationFailureCreate(context, "The upload completion was invalid")
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const completion = await options.uploadApiRepository.uploadCompletionComplete(
        project.id,
        uploadId.output,
        parsed.output,
      )
      if (!completion.success) return domainFailureResponseCreate(context, completion.errorMessage)
      return successResponseCreate(context, completion.data, 202)
    },
  )

  app.get(`${apiVersionPath}/projects/:projectId/assets`, authenticationMiddleware, uploaderMiddleware, (context) => {
    if (options.assetApiRepository === undefined) return dependencyFailureCreate(context)
    const query = v.safeParse(assetListQuerySchema, queryObjectRead(context.req.raw))
    if (!query.success) return validationFailureCreate(context, "The asset list query was invalid")
    if (query.output.folder !== undefined) {
      const folders = v.safeParse(foldersSchema, query.output.folder.split("/"))
      if (!folders.success) return validationFailureCreate(context, "The asset folder filter was invalid")
    }
    const project = projectRead(context)
    if (!project) return failureFromRepositoryCreate(context)
    const assets = options.assetApiRepository.assetsRead(project.id, query.output.class)
    if (!assets.success) return failureFromRepositoryCreate(context)
    const search = query.output.search?.toLocaleLowerCase()
    const folder = query.output.folder
    const filtered = assets.data.filter((asset) => {
      if (
        search !== undefined &&
        !`${asset.sourcePath} ${asset.filename} ${asset.basename}`.toLocaleLowerCase().includes(search)
      )
        return false
      if (
        folder !== undefined &&
        asset.folders.join("/") !== folder &&
        !asset.folders.join("/").startsWith(`${folder}/`)
      )
        return false
      return true
    })
    const offset = query.output.cursor ?? 0
    const limit = Math.min(100, Math.max(1, query.output.limit ?? 50))
    const selected = filtered.slice(offset, offset + limit + 1)
    const includes = new Set(
      (query.output.include ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    )
    if ([...includes].some((value) => !["outputs", "metadata", "history"].includes(value)))
      return validationFailureCreate(context, "The asset list include value was invalid")
    const selectedAssets = []
    for (const asset of selected.slice(0, limit)) {
      if (includes.size === 0) {
        selectedAssets.push(asset)
        continue
      }
      const detail = options.assetApiRepository.assetRead(project.id, asset.id)
      if (!detail.success) return failureFromRepositoryCreate(context)
      if (detail.data === null) return assetNotFoundResponseCreate(context)
      selectedAssets.push({
        ...asset,
        ...(includes.has("history")
          ? { sourceHistory: detail.data.sourceHistory, outputHistory: detail.data.outputHistory }
          : {}),
        ...(includes.has("outputs") ? { outputHistory: detail.data.outputHistory } : {}),
        ...(includes.has("metadata") ? { metadata: detail.data.metadata } : {}),
      })
    }
    return successResponseCreate(context, {
      assets: selectedAssets,
      page: { limit, nextCursor: selected.length > limit ? String(offset + limit) : null },
    })
  })

  app.get(
    `${apiVersionPath}/projects/:projectId/assets/:assetId`,
    authenticationMiddleware,
    uploaderMiddleware,
    (context) => {
      if (options.assetApiRepository === undefined) return dependencyFailureCreate(context)
      const assetId = v.safeParse(idSchema, context.req.param("assetId"))
      if (!assetId.success) return validationFailureCreate(context, "The asset identifier was invalid")
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const asset = options.assetApiRepository.assetRead(project.id, assetId.output)
      if (!asset.success) return failureFromRepositoryCreate(context)
      if (asset.data === null) return assetNotFoundResponseCreate(context)
      return successResponseCreate(context, asset.data)
    },
  )

  app.get(
    `${apiVersionPath}/projects/:projectId/assets/:assetId/history`,
    authenticationMiddleware,
    uploaderMiddleware,
    (context) => {
      if (options.assetApiRepository === undefined) return dependencyFailureCreate(context)
      const assetId = v.safeParse(idSchema, context.req.param("assetId"))
      if (!assetId.success) return validationFailureCreate(context, "The asset identifier was invalid")
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const asset = options.assetApiRepository.assetRead(project.id, assetId.output)
      if (!asset.success) return failureFromRepositoryCreate(context)
      if (asset.data === null) return assetNotFoundResponseCreate(context)
      return successResponseCreate(context, {
        sourceHistory: asset.data.sourceHistory,
        outputHistory: asset.data.outputHistory,
      })
    },
  )

  app.get(
    `${apiVersionPath}/projects/:projectId/assets/:assetId/outputs`,
    authenticationMiddleware,
    uploaderMiddleware,
    (context) => {
      if (options.assetApiRepository === undefined) return dependencyFailureCreate(context)
      const assetId = v.safeParse(idSchema, context.req.param("assetId"))
      if (!assetId.success) return validationFailureCreate(context, "The asset identifier was invalid")
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const outputs = options.assetApiRepository.assetOutputsRead(project.id, assetId.output)
      if (!outputs.success) return failureFromRepositoryCreate(context)
      if (outputs.data === null) return assetNotFoundResponseCreate(context)
      return successResponseCreate(context, { outputs: outputs.data })
    },
  )

  app.post(
    `${apiVersionPath}/projects/:projectId/assets/:assetId/outputs`,
    authenticationMiddleware,
    adminMiddleware,
    async (context) => {
      if (options.assetApiRepository === undefined) return dependencyFailureCreate(context)
      const assetId = v.safeParse(idSchema, context.req.param("assetId"))
      if (!assetId.success) return validationFailureCreate(context, "The asset identifier was invalid")
      const body = await requestBodyRead(context.req.raw)
      const parsed = v.safeParse(outputAddRequestSchema, body)
      if (!parsed.success) return validationFailureCreate(context, "The output definition was invalid")
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const mutation = options.assetApiRepository.assetOutputAdd(project.id, assetId.output, parsed.output)
      if (!mutation.success) return domainFailureResponseCreate(context, mutation.errorMessage)
      if (mutation.data === null) return assetNotFoundResponseCreate(context)
      return outputMutationResponseCreate(context, mutation.data)
    },
  )

  app.put(
    `${apiVersionPath}/projects/:projectId/assets/:assetId/outputs`,
    authenticationMiddleware,
    adminMiddleware,
    async (context) => {
      if (options.assetApiRepository === undefined) return dependencyFailureCreate(context)
      const assetId = v.safeParse(idSchema, context.req.param("assetId"))
      if (!assetId.success) return validationFailureCreate(context, "The asset identifier was invalid")
      const body = await requestBodyRead(context.req.raw)
      const parsed = v.safeParse(outputSetRequestSchema, body)
      if (!parsed.success) return validationFailureCreate(context, "The output set was invalid")
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const mutation = options.assetApiRepository.assetOutputsSet(project.id, assetId.output, parsed.output)
      if (!mutation.success) return domainFailureResponseCreate(context, mutation.errorMessage)
      if (mutation.data === null) return assetNotFoundResponseCreate(context)
      return outputMutationResponseCreate(context, mutation.data)
    },
  )

  app.delete(
    `${apiVersionPath}/projects/:projectId/assets/:assetId/outputs`,
    authenticationMiddleware,
    adminMiddleware,
    async (context) => {
      if (options.assetApiRepository === undefined) return dependencyFailureCreate(context)
      const assetId = v.safeParse(idSchema, context.req.param("assetId"))
      if (!assetId.success) return validationFailureCreate(context, "The asset identifier was invalid")
      const body = await requestBodyRead(context.req.raw)
      const parsed = v.safeParse(outputRemoveRequestSchema, body)
      if (!parsed.success) return validationFailureCreate(context, "The output identifier was invalid")
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const mutation = options.assetApiRepository.assetOutputRemove(project.id, assetId.output, parsed.output.key)
      if (!mutation.success) return domainFailureResponseCreate(context, mutation.errorMessage)
      if (mutation.data === null) return assetNotFoundResponseCreate(context)
      return outputMutationResponseCreate(context, mutation.data)
    },
  )

  app.delete(
    `${apiVersionPath}/projects/:projectId/assets/:assetId/outputs/:outputKey`,
    authenticationMiddleware,
    adminMiddleware,
    (context) => {
      if (options.assetApiRepository === undefined) return dependencyFailureCreate(context)
      const assetId = v.safeParse(idSchema, context.req.param("assetId"))
      const request = v.safeParse(outputRemoveRequestSchema, { key: context.req.param("outputKey") })
      if (!assetId.success || !request.success)
        return validationFailureCreate(context, "The output identifier was invalid")
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const mutation = options.assetApiRepository.assetOutputRemove(project.id, assetId.output, request.output.key)
      if (!mutation.success) return domainFailureResponseCreate(context, mutation.errorMessage)
      if (mutation.data === null) return assetNotFoundResponseCreate(context)
      return outputMutationResponseCreate(context, mutation.data)
    },
  )

  app.patch(
    `${apiVersionPath}/projects/:projectId/assets/:assetId/metadata`,
    authenticationMiddleware,
    adminMiddleware,
    async (context) => {
      if (options.assetApiRepository === undefined) return dependencyFailureCreate(context)
      const assetId = v.safeParse(idSchema, context.req.param("assetId"))
      if (!assetId.success) return validationFailureCreate(context, "The asset identifier was invalid")
      const body = await requestBodyRead(context.req.raw)
      const parsed = v.safeParse(metadataSetRequestSchema, body)
      if (!parsed.success) return validationFailureCreate(context, "The metadata update was invalid")
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const mutation = options.assetApiRepository.assetMetadataSet(project.id, assetId.output, parsed.output.alt)
      if (!mutation.success) return domainFailureResponseCreate(context, mutation.errorMessage)
      if (mutation.data === null) return assetNotFoundResponseCreate(context)
      return successResponseCreate(context, mutation.data.asset)
    },
  )

  app.delete(
    `${apiVersionPath}/projects/:projectId/assets/:assetId/metadata`,
    authenticationMiddleware,
    adminMiddleware,
    async (context) => {
      const body = await requestBodyRead(context.req.raw)
      const parsed = v.safeParse(metadataUnsetRequestSchema, body)
      if (!parsed.success) return validationFailureCreate(context, "The metadata field was invalid")
      return metadataUnsetHandle(context, parsed.output.field)
    },
  )

  app.delete(
    `${apiVersionPath}/projects/:projectId/assets/:assetId/metadata/:field`,
    authenticationMiddleware,
    adminMiddleware,
    (context) => metadataUnsetHandle(context),
  )

  app.post(
    `${apiVersionPath}/projects/:projectId/assets/:assetId/metadata/unset`,
    authenticationMiddleware,
    adminMiddleware,
    async (context) => {
      const body = await requestBodyRead(context.req.raw)
      const parsed = v.safeParse(metadataUnsetRequestSchema, body)
      if (!parsed.success) return validationFailureCreate(context, "The metadata field was invalid")
      return metadataUnsetHandle(context, parsed.output.field)
    },
  )

  app.post(
    `${apiVersionPath}/projects/:projectId/assets/:assetId/move`,
    authenticationMiddleware,
    adminMiddleware,
    async (context) => {
      if (options.assetApiRepository === undefined) return dependencyFailureCreate(context)
      const assetId = v.safeParse(idSchema, context.req.param("assetId"))
      if (!assetId.success) return validationFailureCreate(context, "The asset identifier was invalid")
      const body = await requestBodyRead(context.req.raw)
      const parsed = v.safeParse(moveAssetRequestSchema, body)
      if (!parsed.success) return validationFailureCreate(context, "The move target was invalid")
      const target = moveTargetRead(parsed.output)
      if (!target.success) return validationFailureCreate(context, target.errorMessage)
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const moved = options.assetApiRepository.assetMove(project.id, assetId.output, target.data)
      if (!moved.success) return domainFailureResponseCreate(context, moved.errorMessage)
      if (moved.data === null) return assetNotFoundResponseCreate(context)
      const detail = options.assetApiRepository.assetRead(project.id, assetId.output)
      if (!detail.success) return failureFromRepositoryCreate(context)
      if (detail.data === null) return assetNotFoundResponseCreate(context)
      return successResponseCreate(context, detail.data)
    },
  )

  app.post(
    `${apiVersionPath}/projects/:projectId/assets/:assetId/deletion-request`,
    authenticationMiddleware,
    adminMiddleware,
    async (context) => {
      if (options.deletionApiRepository === undefined) return dependencyFailureCreate(context)
      const assetId = v.safeParse(idSchema, context.req.param("assetId"))
      if (!assetId.success) return validationFailureCreate(context, "The asset identifier was invalid")
      const body = await requestBodyRead(context.req.raw)
      const parsed = v.safeParse(deleteAssetRequestSchema, body ?? {})
      if (!parsed.success) return validationFailureCreate(context, "The deletion request was invalid")
      const project = projectRead(context)
      if (!project) return failureFromRepositoryCreate(context)
      const authentication = context.get("authentication") as RequestAuthentication | undefined
      const deletion = options.deletionApiRepository.deletionRequestEnqueue(
        project.id,
        assetId.output,
        authentication?.principal.subjectId,
      )
      if (!deletion.success) return domainFailureResponseCreate(context, deletion.errorMessage)
      return successResponseCreate(context, deletion.data, 202)
    },
  )

  app.get(`${apiVersionPath}/health/live`, (context) => successResponseCreate(context, { status: "ok" }))
  app.get(`${apiVersionPath}/health/ready`, async (context) => {
    const readiness = await readinessRead()
    if (!readiness.success)
      return apiErrorResponseCreate({
        requestId: requestIdRead(context),
        status: 503,
        code: "service_unavailable",
        message: "The service is not ready",
        retryable: true,
      })
    return successResponseCreate(context, { status: "ready" })
  })
  app.get(`${apiVersionPath}/health/readiness`, async (context) => {
    const readiness = await readinessRead()
    if (!readiness.success)
      return apiErrorResponseCreate({
        requestId: requestIdRead(context),
        status: 503,
        code: "service_unavailable",
        message: "The service is not ready",
        retryable: true,
      })
    return successResponseCreate(context, { status: "ready", checks: { database: "ready" } })
  })
  app.get(`${apiVersionPath}/readiness`, async (context) => {
    const readiness = await readinessRead()
    if (!readiness.success)
      return apiErrorResponseCreate({
        requestId: requestIdRead(context),
        status: 503,
        code: "service_unavailable",
        message: "The service is not ready",
        retryable: true,
      })
    return successResponseCreate(context, { status: "ready", checks: { database: "ready" } })
  })

  apiUploadStatusRoutesRegister(app, {
    repository: options.uploadApiRepository,
    authenticationMiddleware,
    uploaderMiddleware,
  })
  apiDeletionStatusRoutesRegister(app, {
    repository: options.deletionApiRepository,
    authenticationMiddleware,
    uploaderMiddleware,
  })
  apiSourceRevisionDeletionEligibilityRoutesRegister(app, {
    repository: options.deletionApiRepository,
    authenticationMiddleware,
    uploaderMiddleware,
  })
  apiWorkflowRoutesRegister(app, {
    repository: options.workflowApiRepository,
    authenticationMiddleware,
    uploaderMiddleware,
    adminMiddleware,
  })
  apiBackupRoutesRegister(app, {
    repository: options.backupApiRepository,
    authenticationMiddleware,
    uploaderMiddleware,
  })
  apiCatalogRoutesRegister(app, {
    repository: options.catalogApiRepository,
    authenticationMiddleware,
    uploaderMiddleware,
  })
  apiImportRoutesRegister(app, {
    executor: options.legacyImportExecutor,
    authenticationMiddleware,
    adminMiddleware,
  })
  apiAuditRoutesRegister(app, {
    repository: options.auditApiRepository,
    authenticationMiddleware,
    adminMiddleware,
  })

  app.all("*", (context) => {
    const allowedMethods = knownRouteMethodsRead(new URL(context.req.url).pathname)
    if (allowedMethods) {
      return apiErrorResponseCreate({
        requestId: requestIdRead(context),
        status: 405,
        code: "method_not_allowed",
        message: "The HTTP method is not allowed",
        headers: { allow: allowedMethods.join(", ") },
      })
    }
    return apiErrorResponseCreate({
      requestId: requestIdRead(context),
      status: 404,
      code: "not_found",
      message: "The requested route was not found",
    })
  })

  app.onError((error, context) => {
    void error
    return apiErrorResponseCreate({
      requestId: requestIdRead(context),
      status: 500,
      code: "internal_error",
      message: "An internal error occurred",
      retryable: true,
    })
  })

  return app
}
