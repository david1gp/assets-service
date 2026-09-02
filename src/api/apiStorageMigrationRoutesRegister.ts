import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import * as v from "valibot"

import { storageMigrationPlanRequestSchema } from "../api-client/storageMigrationPlanRequestSchema.js"
import { storageMigrationStartRequestSchema } from "../api-client/storageMigrationStartRequestSchema.js"
import type { StorageMigrationTargetRequest } from "../api-client/storageMigrationTargetRequestSchema.js"
import type { Environment } from "../project/environmentSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageMigrationBindingSnapshot } from "../migration/storageMigrationBindingSnapshotSchema.js"
import type { StorageMigration } from "../migration/storageMigrationSchema.js"
import type { StorageMigrationCreateInput } from "../migration/storageMigrationCreateInputSchema.js"
import { storageMigrationBindingSnapshotSchema } from "../migration/storageMigrationBindingSnapshotSchema.js"
import type { StorageMigrationRepository } from "../migration/storageMigrationRepository.js"
import { apiErrorResponseCreate } from "./apiErrorResponseCreate.js"
import { apiResponseCreate } from "./apiResponseCreate.js"
import { apiSuccessEnvelopeCreate } from "./apiSuccessEnvelopeCreate.js"

type ApiContext = { Variables: Record<string, unknown> }
type ApiApp = Hono<ApiContext>
type MigrationEnqueue = (input: StorageMigrationCreateInput) => Result<{ migrationId: string; workflowId: string }>
type EnvironmentReadError = Extract<Result<Environment>, { success: false }>

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
  code: "not_found" | "conflict" | "validation_failed" | "not_configured" | "internal_error",
  message: string,
  details?: Record<string, unknown>,
) =>
  apiErrorResponseCreate({
    requestId: requestIdRead(context),
    status,
    code,
    message,
    retryable: status >= 500,
    ...(details === undefined ? {} : { details }),
  })

const repositoryFailureResponseCreate = (context: { get: (key: string) => unknown }) =>
  failureResponseCreate(context, 500, "internal_error", "The storage migration could not be read")

const environmentFailureResponseCreate = (
  context: { get: (key: string) => unknown },
  environment: EnvironmentReadError,
) => {
  const notFound = environment.errorMessage === "The environment was not found"
  const invalid = environment.errorMessage === "The environment identifier was invalid"
  return failureResponseCreate(
    context,
    notFound ? 404 : invalid ? 400 : 500,
    notFound ? "not_found" : invalid ? "validation_failed" : "internal_error",
    notFound
      ? "The environment was not found"
      : invalid
        ? "The environment identifier was invalid"
        : "The environment could not be read",
  )
}

const idRead = (context: { req: { param: (name: string) => string } }, name: string): string | null => {
  const parsed = v.safeParse(idSchema, context.req.param(name))
  return parsed.success ? parsed.output : null
}

const projectEnvironmentRead = (
  context: { get: (key: string) => unknown; req: { param: (name: string) => string } },
  projectRepository: {
    environmentRead: (projectId: string, environmentIdentifier: string) => Result<Environment | null>
  },
): Result<Environment> => {
  const projectId = projectIdRead(context)
  if (projectId === null)
    return { success: false, op: "apiStorageMigrationEnvironmentRead", errorMessage: "The project could not be read" }
  const environmentIdentifier = idRead(context, "environment")
  if (environmentIdentifier === null)
    return {
      success: false,
      op: "apiStorageMigrationEnvironmentRead",
      errorMessage: "The environment identifier was invalid",
    }
  const environment = projectRepository.environmentRead(projectId, environmentIdentifier)
  if (!environment.success)
    return { success: false, op: environment.op, errorMessage: environment.errorMessage, rawData: environment.rawData }
  if (environment.data === null || environment.data.projectId !== projectId)
    return { success: false, op: "apiStorageMigrationEnvironmentRead", errorMessage: "The environment was not found" }
  return { success: true, data: environment.data }
}

const sourceBindingCreate = (environment: Environment): StorageMigrationBindingSnapshot => ({
  projectId: environment.projectId,
  environmentId: environment.id,
  environment: environment.name,
  bucket: environment.r2Bucket,
  prefix: environment.r2Prefix,
  publicBaseUrl: environment.publicBaseUrl,
})

const bindingEqual = (left: StorageMigrationBindingSnapshot, right: StorageMigrationBindingSnapshot): boolean =>
  left.projectId === right.projectId &&
  left.environmentId === right.environmentId &&
  left.environment === right.environment &&
  left.bucket === right.bucket &&
  left.prefix === right.prefix &&
  left.publicBaseUrl === right.publicBaseUrl

const targetBindingCreate = (
  source: StorageMigrationBindingSnapshot,
  target: StorageMigrationTargetRequest,
): StorageMigrationBindingSnapshot => ({
  ...source,
  bucket: target.r2Bucket ?? source.bucket,
  prefix: target.r2Prefix ?? source.prefix,
  publicBaseUrl: target.publicBaseUrl ?? source.publicBaseUrl,
})

const targetFieldsPresent = (input: StorageMigrationTargetRequest): boolean =>
  input.r2Bucket !== undefined || input.r2Prefix !== undefined || input.publicBaseUrl !== undefined

const migrationInputRead = (
  projectId: string,
  environment: Environment,
  input: v.InferOutput<typeof storageMigrationStartRequestSchema>,
): Result<StorageMigrationCreateInput> => {
  const source = v.safeParse(storageMigrationBindingSnapshotSchema, input.sourceBinding)
  if (!source.success)
    return { success: false, op: "apiStorageMigrationStart", errorMessage: "The planned source binding was invalid" }

  if (
    source.output.projectId !== projectId ||
    source.output.environmentId !== environment.id ||
    source.output.environment !== environment.name
  )
    return {
      success: false,
      op: "apiStorageMigrationStart",
      errorMessage: "The planned source binding did not match the environment",
    }

  if (input.targetBinding !== undefined && targetFieldsPresent(input))
    return {
      success: false,
      op: "apiStorageMigrationStart",
      errorMessage: "The migration target was specified more than once",
    }

  const target = input.targetBinding === undefined ? targetBindingCreate(source.output, input) : input.targetBinding

  if (
    target.projectId !== projectId ||
    target.environmentId !== environment.id ||
    target.environment !== environment.name
  )
    return {
      success: false,
      op: "apiStorageMigrationStart",
      errorMessage: "The migration target did not match the environment",
    }

  if (bindingEqual(source.output, target))
    return {
      success: false,
      op: "apiStorageMigrationStart",
      errorMessage: "The migration target must change at least one field",
    }

  return {
    success: true,
    data: {
      projectId,
      environmentId: environment.id,
      idempotencyKey: input.idempotencyKey,
      sourceBinding: source.output,
      targetBinding: target,
    },
  }
}

const migrationCurrentRead = (
  repository: StorageMigrationRepository,
  migrationId: string,
): Result<StorageMigration> => {
  const migration = repository.storageMigrationRead(migrationId)
  if (!migration.success)
    return { success: false, op: migration.op, errorMessage: migration.errorMessage, rawData: migration.rawData }
  if (migration.data === null)
    return { success: false, op: "apiStorageMigrationCurrentRead", errorMessage: "The storage migration was not found" }
  return { success: true, data: migration.data }
}

const startResponseCreate = (
  context: { get: (key: string) => unknown },
  enqueue: { migrationId: string; workflowId: string },
  migration: StorageMigration,
) =>
  successResponseCreate(
    context,
    {
      accepted: true,
      migrationId: enqueue.migrationId,
      workflowId: enqueue.workflowId,
      migration,
    },
    202,
  )

export const apiStorageMigrationRoutesRegister = (
  app: ApiApp,
  options: {
    projectRepository: {
      environmentRead: (projectId: string, environmentIdentifier: string) => Result<Environment | null>
    }
    repository?: StorageMigrationRepository
    workflowEnqueue?: MigrationEnqueue
    authenticationMiddleware: MiddlewareHandler<ApiContext>
    adminMiddleware: MiddlewareHandler<ApiContext>
  },
): void => {
  const prefix = "/api/v1/projects/:projectId/environments/:environment/storage-migration"

  app.post(`${prefix}/plan`, options.authenticationMiddleware, options.adminMiddleware, async (context) => {
    if (options.repository === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The storage migration API is not configured")
    const projectId = projectIdRead(context)
    if (projectId === null) return repositoryFailureResponseCreate(context)
    const environment = projectEnvironmentRead(context, options.projectRepository)
    if (!environment.success) return environmentFailureResponseCreate(context, environment)
    const parsed = v.safeParse(storageMigrationPlanRequestSchema, await requestBodyRead(context.req.raw))
    if (!parsed.success)
      return failureResponseCreate(context, 400, "validation_failed", "The storage migration plan was invalid")
    const source = sourceBindingCreate(environment.data)
    const validSource = v.safeParse(storageMigrationBindingSnapshotSchema, source)
    if (!validSource.success)
      return failureResponseCreate(context, 400, "validation_failed", "The storage migration source was invalid")
    const target = targetBindingCreate(source, parsed.output)
    const validTarget = v.safeParse(storageMigrationBindingSnapshotSchema, target)
    if (!validTarget.success)
      return failureResponseCreate(context, 400, "validation_failed", "The storage migration target was invalid")
    if (bindingEqual(source, target))
      return failureResponseCreate(
        context,
        400,
        "validation_failed",
        "The migration target must change at least one field",
      )

    let existingMigration: StorageMigration | null = null
    if (parsed.output.idempotencyKey !== undefined) {
      const existing = options.repository.storageMigrationReadByIdempotencyKey(
        environment.data.id,
        parsed.output.idempotencyKey,
      )
      if (!existing.success) return repositoryFailureResponseCreate(context)
      existingMigration = existing.data
    }
    const active = options.repository.storageMigrationReadActive(environment.data.id)
    if (!active.success) return repositoryFailureResponseCreate(context)
    return successResponseCreate(context, {
      sourceBinding: source,
      targetBinding: target,
      copyRequired: source.bucket !== target.bucket || source.prefix !== target.prefix,
      idempotencyKey: parsed.output.idempotencyKey ?? null,
      idempotency: {
        existingMigrationId: existingMigration?.id ?? null,
        existingMigrationStatus: existingMigration?.status ?? null,
        activeMigrationId: active.data?.id ?? null,
      },
    })
  })

  app.post(`${prefix}/start`, options.authenticationMiddleware, options.adminMiddleware, async (context) => {
    if (options.repository === undefined || options.workflowEnqueue === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The storage migration API is not configured")
    const projectId = projectIdRead(context)
    if (projectId === null) return repositoryFailureResponseCreate(context)
    const environment = projectEnvironmentRead(context, options.projectRepository)
    if (!environment.success) return environmentFailureResponseCreate(context, environment)
    const parsed = v.safeParse(storageMigrationStartRequestSchema, await requestBodyRead(context.req.raw))
    if (!parsed.success)
      return failureResponseCreate(context, 400, "validation_failed", "The storage migration start was invalid")
    const input = migrationInputRead(projectId, environment.data, parsed.output)
    if (!input.success) {
      const conflict = /did not match|did not match the environment/i.test(input.errorMessage)
      return failureResponseCreate(
        context,
        conflict ? 409 : 400,
        conflict ? "conflict" : "validation_failed",
        conflict ? "The planned source no longer matches the environment" : input.errorMessage,
      )
    }

    const existing = options.repository.storageMigrationReadByIdempotencyKey(
      environment.data.id,
      input.data.idempotencyKey,
    )
    if (!existing.success) return repositoryFailureResponseCreate(context)
    if (existing.data !== null) {
      if (
        !bindingEqual(existing.data.sourceBinding, input.data.sourceBinding) ||
        !bindingEqual(existing.data.targetBinding, input.data.targetBinding)
      )
        return failureResponseCreate(
          context,
          409,
          "conflict",
          "The idempotency key belongs to a different storage migration",
        )
      if (existing.data.status === "queued" || existing.data.status === "running") {
        const repaired = options.workflowEnqueue(input.data)
        if (!repaired.success) {
          const conflict = /already|active|different|match|concurrently/i.test(repaired.errorMessage)
          return failureResponseCreate(
            context,
            conflict ? 409 : 500,
            conflict ? "conflict" : "internal_error",
            conflict
              ? "The storage migration conflicts with an existing migration"
              : "The storage migration could not be started",
          )
        }
        const migration = migrationCurrentRead(options.repository, repaired.data.migrationId)
        if (!migration.success)
          return failureResponseCreate(context, 500, "internal_error", "The storage migration could not be read", {
            migrationId: repaired.data.migrationId,
          })
        return startResponseCreate(context, repaired.data, migration.data)
      }
      return startResponseCreate(
        context,
        { migrationId: existing.data.id, workflowId: `workflow-storage-migration-${existing.data.id}` },
        existing.data,
      )
    }

    const current = sourceBindingCreate(environment.data)
    if (!bindingEqual(current, input.data.sourceBinding))
      return failureResponseCreate(context, 409, "conflict", "The planned source no longer matches the environment")

    const enqueued = options.workflowEnqueue(input.data)
    if (!enqueued.success) {
      const conflict = /already|active|different|match|concurrently/i.test(enqueued.errorMessage)
      return failureResponseCreate(
        context,
        conflict ? 409 : 500,
        conflict ? "conflict" : "internal_error",
        conflict
          ? "The storage migration conflicts with an existing migration"
          : "The storage migration could not be started",
      )
    }
    const migration = migrationCurrentRead(options.repository, enqueued.data.migrationId)
    if (!migration.success)
      return failureResponseCreate(context, 500, "internal_error", "The storage migration could not be read", {
        migrationId: enqueued.data.migrationId,
      })
    return startResponseCreate(context, enqueued.data, migration.data)
  })

  app.get(`${prefix}/:migrationId/status`, options.authenticationMiddleware, options.adminMiddleware, (context) => {
    if (options.repository === undefined)
      return failureResponseCreate(context, 500, "not_configured", "The storage migration API is not configured")
    const projectId = projectIdRead(context)
    const migrationId = idRead(context, "migrationId")
    if (projectId === null) return repositoryFailureResponseCreate(context)
    if (migrationId === null)
      return failureResponseCreate(context, 400, "validation_failed", "The storage migration identifier was invalid")
    const environment = projectEnvironmentRead(context, options.projectRepository)
    if (!environment.success) return environmentFailureResponseCreate(context, environment)
    const migration = options.repository.storageMigrationRead(migrationId)
    if (!migration.success) return repositoryFailureResponseCreate(context)
    if (
      migration.data === null ||
      migration.data.projectId !== projectId ||
      migration.data.environmentId !== environment.data.id
    )
      return failureResponseCreate(context, 404, "not_found", "The storage migration was not found")
    return successResponseCreate(context, migration.data)
  })
}
