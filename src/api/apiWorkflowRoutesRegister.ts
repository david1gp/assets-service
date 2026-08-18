import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { apiErrorResponseCreate } from "./apiErrorResponseCreate.js"
import { apiResponseCreate } from "./apiResponseCreate.js"
import { apiSuccessEnvelopeCreate } from "./apiSuccessEnvelopeCreate.js"
import { jobActionRequestSchema } from "../api-client/jobActionRequestSchema.js"
import { jobListQuerySchema } from "../api-client/jobListQuerySchema.js"
import { workflowActionRequestSchema } from "../api-client/workflowActionRequestSchema.js"
import { workflowListQuerySchema } from "../api-client/workflowListQuerySchema.js"
import type { WorkflowApiRepository } from "../workflow/workflowApiRepository.js"

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
  code: "not_found" | "conflict" | "validation_failed" | "not_configured" | "internal_error",
  message: string,
) => apiErrorResponseCreate({ requestId: requestIdRead(context), status, code, message, retryable: status >= 500 })
const repositoryFailureResponseCreate = (context: { get: (key: string) => unknown }, errorMessage: string) => {
  const notFound = /not found|does not exist/i.test(errorMessage)
  const conflict = /cannot|only|terminal|failed jobs|concurrently/i.test(errorMessage)
  // A conflict message states the invariant the caller hit, so the UI can show
  // it. Unexpected failures stay generic to avoid leaking internals.
  return failureResponseCreate(
    context,
    notFound ? 404 : conflict ? 409 : 500,
    notFound ? "not_found" : conflict ? "conflict" : "internal_error",
    notFound
      ? "The requested workflow resource was not found"
      : conflict
        ? errorMessage
        : "The workflow resource could not be read",
  )
}
const idRead = (context: { req: { param: (name: string) => string }; get: (key: string) => unknown }, name: string) => {
  const parsed = v.safeParse(idSchema, context.req.param(name))
  return parsed.success ? parsed.output : null
}

export const apiWorkflowRoutesRegister = (
  app: ApiApp,
  options: {
    repository?: WorkflowApiRepository
    authenticationMiddleware: MiddlewareHandler<ApiContext>
    uploaderMiddleware: MiddlewareHandler<ApiContext>
    adminMiddleware: MiddlewareHandler<ApiContext>
  },
): void => {
  const prefix = "/api/v1/projects/:projectId"
  const repositoryRead = (context: { get: (key: string) => unknown }) => {
    if (options.repository !== undefined) return options.repository
    return null
  }

  app.get(`${prefix}/workflows`, options.authenticationMiddleware, options.uploaderMiddleware, (context) => {
    const repository = repositoryRead(context)
    if (repository === null)
      return failureResponseCreate(context, 500, "not_configured", "The workflow API is not configured")
    const projectId = projectIdRead(context)
    const parsedQuery = v.safeParse(workflowListQuerySchema, queryObjectRead(context.req.raw))
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (!parsedQuery.success)
      return failureResponseCreate(context, 400, "validation_failed", "The workflow list query was invalid")
    const query = parsedQuery.output
    const workflows = repository.workflowsRead(projectId, query)
    if (!workflows.success) return repositoryFailureResponseCreate(context, workflows.errorMessage)
    return successResponseCreate(context, {
      workflows: workflows.data.items,
      page: {
        limit: query.limit ?? 50,
        nextCursor: workflows.data.nextCursor === null ? null : String(workflows.data.nextCursor),
      },
    })
  })

  const workflowHandle = (
    context: { req: { param: (name: string) => string }; get: (key: string) => unknown },
    statusOnly = false,
  ) => {
    const repository = repositoryRead(context)
    if (repository === null)
      return failureResponseCreate(context, 500, "not_configured", "The workflow API is not configured")
    const projectId = projectIdRead(context)
    const workflowId = idRead(context, "workflowId")
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (workflowId === null)
      return failureResponseCreate(context, 400, "validation_failed", "The workflow identifier was invalid")
    const workflow = repository.workflowRead(projectId, workflowId)
    if (!workflow.success) return repositoryFailureResponseCreate(context, workflow.errorMessage)
    if (workflow.data === null) return failureResponseCreate(context, 404, "not_found", "The workflow was not found")
    return successResponseCreate(context, statusOnly ? workflow.data.workflow : workflow.data)
  }

  app.get(`${prefix}/workflows/:workflowId`, options.authenticationMiddleware, options.uploaderMiddleware, (context) =>
    workflowHandle(context),
  )
  app.get(
    `${prefix}/workflows/:workflowId/status`,
    options.authenticationMiddleware,
    options.uploaderMiddleware,
    (context) => workflowHandle(context, true),
  )

  const workflowActionHandle = (
    context: { req: { param: (name: string) => string; raw: Request }; get: (key: string) => unknown },
    action: "retry" | "cancel",
  ) =>
    requestBodyRead(context.req.raw).then((body) => {
      const parsedBody = v.safeParse(workflowActionRequestSchema, body ?? {})
      if (!parsedBody.success)
        return failureResponseCreate(context, 400, "validation_failed", "The workflow action request was invalid")
      const repository = repositoryRead(context)
      if (repository === null)
        return failureResponseCreate(context, 500, "not_configured", "The workflow API is not configured")
      const projectId = projectIdRead(context)
      const workflowId = idRead(context, "workflowId")
      if (projectId === null)
        return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
      if (workflowId === null)
        return failureResponseCreate(context, 400, "validation_failed", "The workflow identifier was invalid")
      const result =
        action === "retry"
          ? repository.workflowRetry(projectId, workflowId)
          : repository.workflowCancel(projectId, workflowId)
      if (!result.success) return repositoryFailureResponseCreate(context, result.errorMessage)
      if (result.data === null) return failureResponseCreate(context, 404, "not_found", "The workflow was not found")
      return successResponseCreate(context, result.data, 202)
    })
  app.post(
    `${prefix}/workflows/:workflowId/retry`,
    options.authenticationMiddleware,
    options.adminMiddleware,
    (context) => workflowActionHandle(context, "retry"),
  )
  app.post(
    `${prefix}/workflows/:workflowId/cancel`,
    options.authenticationMiddleware,
    options.adminMiddleware,
    (context) => workflowActionHandle(context, "cancel"),
  )

  app.get(`${prefix}/jobs`, options.authenticationMiddleware, options.uploaderMiddleware, (context) => {
    const repository = repositoryRead(context)
    if (repository === null)
      return failureResponseCreate(context, 500, "not_configured", "The workflow API is not configured")
    const projectId = projectIdRead(context)
    const parsedQuery = v.safeParse(jobListQuerySchema, queryObjectRead(context.req.raw))
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (!parsedQuery.success)
      return failureResponseCreate(context, 400, "validation_failed", "The job list query was invalid")
    const query = parsedQuery.output
    const jobs = repository.jobsRead(projectId, query)
    if (!jobs.success) return repositoryFailureResponseCreate(context, jobs.errorMessage)
    return successResponseCreate(context, {
      jobs: jobs.data.items,
      page: {
        limit: query.limit ?? 50,
        nextCursor: jobs.data.nextCursor === null ? null : String(jobs.data.nextCursor),
      },
    })
  })

  const jobHandle = (
    context: { req: { param: (name: string) => string }; get: (key: string) => unknown },
    statusOnly = false,
  ) => {
    const repository = repositoryRead(context)
    if (repository === null)
      return failureResponseCreate(context, 500, "not_configured", "The workflow API is not configured")
    const projectId = projectIdRead(context)
    const jobId = idRead(context, "jobId")
    if (projectId === null)
      return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
    if (jobId === null)
      return failureResponseCreate(context, 400, "validation_failed", "The job identifier was invalid")
    const job = repository.jobRead(projectId, jobId)
    if (!job.success) return repositoryFailureResponseCreate(context, job.errorMessage)
    if (job.data === null) return failureResponseCreate(context, 404, "not_found", "The job was not found")
    return successResponseCreate(context, statusOnly ? job.data.job : job.data)
  }
  app.get(`${prefix}/jobs/:jobId`, options.authenticationMiddleware, options.uploaderMiddleware, (context) =>
    jobHandle(context),
  )
  app.get(`${prefix}/jobs/:jobId/status`, options.authenticationMiddleware, options.uploaderMiddleware, (context) =>
    jobHandle(context, true),
  )

  const jobActionHandle = (
    context: { req: { param: (name: string) => string; raw: Request }; get: (key: string) => unknown },
    action: "retry" | "cancel",
  ) =>
    requestBodyRead(context.req.raw).then((body) => {
      const parsedBody = v.safeParse(jobActionRequestSchema, body ?? {})
      if (!parsedBody.success)
        return failureResponseCreate(context, 400, "validation_failed", "The job action request was invalid")
      const repository = repositoryRead(context)
      if (repository === null)
        return failureResponseCreate(context, 500, "not_configured", "The workflow API is not configured")
      const projectId = projectIdRead(context)
      const jobId = idRead(context, "jobId")
      if (projectId === null)
        return failureResponseCreate(context, 500, "internal_error", "The project could not be read")
      if (jobId === null)
        return failureResponseCreate(context, 400, "validation_failed", "The job identifier was invalid")
      const result = action === "retry" ? repository.jobRetry(projectId, jobId) : repository.jobCancel(projectId, jobId)
      if (!result.success) return repositoryFailureResponseCreate(context, result.errorMessage)
      if (result.data === null) return failureResponseCreate(context, 404, "not_found", "The job was not found")
      return successResponseCreate(context, result.data, 202)
    })
  app.post(`${prefix}/jobs/:jobId/retry`, options.authenticationMiddleware, options.adminMiddleware, (context) =>
    jobActionHandle(context, "retry"),
  )
  app.post(`${prefix}/jobs/:jobId/cancel`, options.authenticationMiddleware, options.adminMiddleware, (context) =>
    jobActionHandle(context, "cancel"),
  )
}
