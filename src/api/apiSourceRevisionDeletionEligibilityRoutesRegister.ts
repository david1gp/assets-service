import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import type { DeletionApiRepository } from "../deletion/deletionApiRepository.js"
import { apiErrorResponseCreate } from "./apiErrorResponseCreate.js"
import { apiResponseCreate } from "./apiResponseCreate.js"
import { apiSuccessEnvelopeCreate } from "./apiSuccessEnvelopeCreate.js"

type ApiContext = { Variables: Record<string, unknown> }
type ApiApp = Hono<ApiContext>

const queryObjectRead = (request: Request): Record<string, string> =>
  Object.fromEntries(new URL(request.url).searchParams.entries())

const requestIdRead = (context: { get: (key: string) => unknown }): string =>
  String(context.get("requestId") ?? "unknown")

const projectIdRead = (context: { get: (key: string) => unknown }): string | null => {
  const project = context.get("project")
  return project && typeof project === "object" && "id" in project && typeof project.id === "string" ? project.id : null
}

const responseCreate = (context: { get: (key: string) => unknown }, data: unknown) =>
  apiResponseCreate(apiSuccessEnvelopeCreate(data, requestIdRead(context)), {
    status: 200,
    requestId: requestIdRead(context),
  })

export const apiSourceRevisionDeletionEligibilityRoutesRegister = (
  app: ApiApp,
  options: {
    repository?: DeletionApiRepository
    authenticationMiddleware: MiddlewareHandler<ApiContext>
    uploaderMiddleware: MiddlewareHandler<ApiContext>
  },
): void => {
  app.get(
    "/api/v1/projects/:projectId/source-revisions/:sourceRevisionId/deletion-eligibility",
    options.authenticationMiddleware,
    options.uploaderMiddleware,
    (context) => {
      const projectId = projectIdRead(context)
      const sourceRevisionId = v.safeParse(idSchema, context.req.param("sourceRevisionId"))
      const environment = v.safeParse(environmentNameSchema, queryObjectRead(context.req.raw).environment)
      if (projectId === null)
        return apiErrorResponseCreate({
          requestId: requestIdRead(context),
          status: 500,
          code: "internal_error",
          message: "The project could not be read",
        })
      if (!sourceRevisionId.success)
        return apiErrorResponseCreate({
          requestId: requestIdRead(context),
          status: 400,
          code: "validation_failed",
          message: "The source revision identifier was invalid",
        })
      if (!environment.success)
        return apiErrorResponseCreate({
          requestId: requestIdRead(context),
          status: 400,
          code: "validation_failed",
          message: "The target environment was invalid",
        })
      const eligibility = options.repository?.sourceRevisionDeletionEligibilityRead?.(
        projectId,
        environment.output,
        sourceRevisionId.output,
      )
      if (eligibility === undefined)
        return apiErrorResponseCreate({
          requestId: requestIdRead(context),
          status: 500,
          code: "not_configured",
          message: "The deletion eligibility API is not configured",
          retryable: true,
        })
      if (!eligibility.success)
        return apiErrorResponseCreate({
          requestId: requestIdRead(context),
          status: 500,
          code: "internal_error",
          message: "The deletion eligibility could not be read",
          retryable: true,
        })
      return responseCreate(context, eligibility.data)
    },
  )
}
