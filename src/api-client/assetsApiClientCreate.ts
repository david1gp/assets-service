import * as v from "valibot"
import type { DeletionState } from "../deletion/deletionStateSchema.js"
import { outputDefinitionSchema } from "../output/outputDefinitionSchema.js"
import { environmentSchema } from "../project/environmentSchema.js"
import { projectSchema } from "../project/projectSchema.js"
import { projectSettingsSchema } from "../project/projectSettingsSchema.js"
import { projectSettingsUpdateSchema } from "../project/projectSettingsUpdateSchema.js"
import { assetClassSchema } from "../schemas/assetClassSchema.js"
import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { storageUploadIntentSchema } from "../storage/storageUploadIntentSchema.js"
import { assetStructureFolderMembershipSchema } from "../structure/assetStructureFolderMembershipSchema.js"
import { structureFolderCreateInputSchema } from "../structure/structureFolderCreateInputSchema.js"
import { structureFolderSchema } from "../structure/structureFolderSchema.js"
import { uploadSchema } from "../upload/uploadSchema.js"
import { jobKindSchema } from "../workflow/jobKindSchema.js"
import { jobStatusSchema } from "../workflow/jobStatusSchema.js"
import { workflowSchema } from "../workflow/workflowSchema.js"
import { workflowStatusSchema } from "../workflow/workflowStatusSchema.js"
import { assetDetailResponseSchema } from "./assetDetailResponseSchema.js"
import { assetHistoryResponseSchema } from "./assetHistoryResponseSchema.js"
import { assetListResponseSchema } from "./assetListResponseSchema.js"
import { assetStructureFolderMembershipSetRequestSchema } from "./assetStructureFolderMembershipSetRequestSchema.js"
import { assetsApiResultOptionalRead } from "./assetsApiResultOptionalRead.js"
import { auditEventListResponseSchema } from "./auditEventListResponseSchema.js"
import { backupListResponseSchema } from "./backupListResponseSchema.js"
import { catalogHistoryResponseSchema } from "./catalogHistoryResponseSchema.js"
import { catalogResponseSchema } from "./catalogResponseSchema.js"
import { deletionRequestResponseSchema } from "./deletionRequestResponseSchema.js"
import { deletionStatusResponseSchema } from "./deletionStatusResponseSchema.js"
import { generatedListsResponseSchema } from "./generatedListsResponseSchema.js"
import { jobActionRequestSchema } from "./jobActionRequestSchema.js"
import { jobListResponseSchema } from "./jobListResponseSchema.js"
import { jobResponseSchema } from "./jobResponseSchema.js"
import { legacyImportListResponseSchema } from "./legacyImportListResponseSchema.js"
import { legacyImportRequestSchema } from "./legacyImportRequestSchema.js"
import { legacyImportResponseSchema } from "./legacyImportResponseSchema.js"
import { metadataSetRequestSchema } from "./metadataSetRequestSchema.js"
import { metadataUnsetRequestSchema } from "./metadataUnsetRequestSchema.js"
import { moveAssetRequestSchema } from "./moveAssetRequestSchema.js"
import { outputAddRequestSchema } from "./outputAddRequestSchema.js"
import { outputListResponseSchema } from "./outputListResponseSchema.js"
import { outputRemoveRequestSchema } from "./outputRemoveRequestSchema.js"
import { outputSetRequestSchema } from "./outputSetRequestSchema.js"
import { projectListResponseSchema } from "./projectListResponseSchema.js"
import type { SourceRevisionContentMode } from "./sourceRevisionContentModeSchema.js"
import { sourceRevisionDeletionEligibilityResponseSchema } from "./sourceRevisionDeletionEligibilityResponseSchema.js"
import { structureResponseSchema } from "./structureResponseSchema.js"
import { uploadCompletionRequestSchema } from "./uploadCompletionRequestSchema.js"
import { uploadCompletionResponseSchema } from "./uploadCompletionResponseSchema.js"
import { uploadIntentRequestSchema } from "./uploadIntentRequestSchema.js"
import { uploadIntentResponseSchema } from "./uploadIntentResponseSchema.js"
import { workflowActionRequestSchema } from "./workflowActionRequestSchema.js"
import { workflowListResponseSchema } from "./workflowListResponseSchema.js"
import { workflowResponseSchema } from "./workflowResponseSchema.js"

export type AssetsApiClientOptions = {
  apiUrl: string
  accessToken?: string
  sessionCookie?: string
  fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>
  sleep?: (milliseconds: number) => Promise<void>
  pollIntervalMilliseconds?: number
  maxPolls?: number
}

type QueryValue = string | number | boolean | undefined
type Query = Readonly<Record<string, QueryValue>>
type Schema = v.GenericSchema<any, any>

const pageInputSchema = v.strictObject({
  cursor: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1000000000))),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
})

const projectListInputSchema = v.strictObject({
  ...pageInputSchema.entries,
  search: v.optional(v.pipe(v.string(), v.maxLength(255))),
})

const assetListInputSchema = v.strictObject({
  ...pageInputSchema.entries,
  class: v.optional(assetClassSchema),
  include: v.optional(v.pipe(v.string(), v.maxLength(128))),
  search: v.optional(v.pipe(v.string(), v.maxLength(255))),
  folder: v.optional(v.pipe(v.string(), v.maxLength(255))),
})

const catalogListInputSchema = v.strictObject({
  ...pageInputSchema.entries,
  generationId: v.optional(idSchema),
})

const backupListInputSchema = v.strictObject({
  ...pageInputSchema.entries,
  assetId: v.optional(idSchema),
  sourceRevisionId: v.optional(idSchema),
})

const workflowListInputSchema = v.strictObject({
  ...pageInputSchema.entries,
  status: v.optional(workflowStatusSchema),
  kind: v.optional(v.picklist(["asset_processing", "catalog_generation", "deletion", "cleanup"])),
  assetId: v.optional(idSchema),
})

const jobListInputSchema = v.strictObject({
  ...pageInputSchema.entries,
  status: v.optional(jobStatusSchema),
  kind: v.optional(jobKindSchema),
  workflowId: v.optional(idSchema),
})

const auditEventListInputSchema = v.strictObject({
  ...pageInputSchema.entries,
  actorId: v.optional(v.pipe(v.string(), v.maxLength(255))),
  action: v.optional(v.pipe(v.string(), v.maxLength(128))),
  resourceType: v.optional(v.pipe(v.string(), v.maxLength(128))),
  resourceId: v.optional(idSchema),
})

const importListInputSchema = v.strictObject({
  ...pageInputSchema.entries,
  status: v.optional(v.picklist(["queued", "running", "succeeded", "failed", "cancelled"])),
})

const environmentsResponseSchema = v.strictObject({ environments: v.array(environmentSchema) })
const healthResponseSchema = v.strictObject({ status: v.pipe(v.string(), v.minLength(1)) })
const authLoginResponseSchema = v.strictObject({ authorizationUrl: v.pipe(v.string(), v.url()) })
const authSessionResponseSchema = v.strictObject({ authenticated: v.boolean(), principal: v.nullable(v.unknown()) })
const outputMutationResponseSchema = v.strictObject({
  outputs: v.array(outputDefinitionSchema),
  workflowId: v.optional(idSchema),
})
const resultFailure = (op: string, message: string, rawData?: unknown): Result<never> =>
  resultErrorCreate(op, message, rawData)

const schemaParse = <T>(schema: Schema, input: unknown, op: string, message: string): Result<T> => {
  const parsed = v.safeParse(schema, input)
  if (!parsed.success) return resultFailure(op, message, v.summarize(parsed.issues))
  return { success: true, data: parsed.output as T }
}

const queryStringCreate = (query: Query): string => {
  const search = new URLSearchParams()
  for (const key of Object.keys(query).sort()) {
    const value = query[key]
    if (value !== undefined) search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded.length === 0 ? "" : `?${encoded}`
}

const baseUrlCreate = (apiUrl: string): Result<string> => {
  const op = "assetsApiClientCreate"
  let url: URL
  try {
    url = new URL(apiUrl)
  } catch {
    return resultFailure(op, "The API URL was invalid")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return resultFailure(op, "The API URL must use HTTP or HTTPS")
  url.search = ""
  url.hash = ""
  let value = url.toString().replace(/\/$/u, "")
  if (value.endsWith("/api/v1")) value = value.slice(0, -7)
  return { success: true, data: value }
}

const errorRawDataRead = (response: Response, body: unknown): Record<string, unknown> => ({
  status: response.status,
  requestId: response.headers.get("x-request-id") ?? undefined,
  ...(body && typeof body === "object" ? { body } : {}),
})

export const assetsApiClientCreate = (options: AssetsApiClientOptions) => {
  const op = "assetsApiClientCreate"
  const baseUrl = baseUrlCreate(options.apiUrl)
  if (!baseUrl.success) return resultFailure(op, baseUrl.errorMessage)

  const fetcher = options.fetcher ?? fetch
  const sleep =
    options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const pollIntervalMilliseconds = options.pollIntervalMilliseconds ?? 1000
  const maxPolls = options.maxPolls ?? 60

  const apiUrlCreate = (path: string, query: Query = {}): string =>
    `${baseUrl.data}/api/v1${path}${queryStringCreate(query)}`

  const requestRead = async <T>(request: {
    path: string
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    query?: Query
    body?: unknown
    bodySchema?: Schema
    responseSchema: v.GenericSchema<any, T>
    operation: string
    authenticated?: boolean
  }): Promise<Result<T>> => {
    const method = request.method ?? "GET"
    if (request.bodySchema !== undefined) {
      const parsedBody = schemaParse(
        request.bodySchema,
        request.body,
        request.operation,
        "The request body was invalid",
      )
      if (!parsedBody.success) return parsedBody
    }

    const headers = new Headers({ accept: "application/json" })
    const authenticated = request.authenticated ?? true
    if (authenticated && options.accessToken) headers.set("authorization", `Bearer ${options.accessToken}`)
    if (options.sessionCookie) headers.set("cookie", options.sessionCookie)
    if (request.body !== undefined) {
      headers.set("content-type", "application/json; charset=UTF-8")
    }

    let response: Response
    try {
      response = await fetcher(apiUrlCreate(request.path, request.query), {
        method,
        headers,
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      })
    } catch {
      return resultFailure(request.operation, "The assets service could not be reached", {
        code: "service_unavailable",
      })
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      return resultFailure(
        request.operation,
        "The assets service returned invalid JSON",
        errorRawDataRead(response, undefined),
      )
    }

    const envelope = v.safeParse(
      v.union([
        v.strictObject({ ok: v.literal(true), data: v.unknown(), requestId: v.optional(v.string()) }),
        v.strictObject({
          ok: v.literal(false),
          error: v.strictObject({
            code: v.string(),
            message: v.pipe(v.string(), v.minLength(1)),
            details: v.optional(v.record(v.string(), v.unknown())),
            retryable: v.boolean(),
          }),
          requestId: v.optional(v.string()),
        }),
      ]),
      body,
    )
    if (!envelope.success)
      return resultFailure(
        request.operation,
        "The assets service returned an invalid envelope",
        errorRawDataRead(response, body),
      )
    if (!response.ok || !envelope.output.ok) {
      if (!envelope.output.ok) {
        return resultFailure(request.operation, envelope.output.error.message, {
          status: response.status,
          requestId: envelope.output.requestId,
          error: envelope.output.error,
        })
      }
      return resultFailure(request.operation, "The assets service returned an error", errorRawDataRead(response, body))
    }

    return schemaParse<T>(
      request.responseSchema,
      envelope.output.data,
      request.operation,
      "The response data was invalid",
    )
  }

  const pageReadAll = async <T>(
    read: (query: {
      cursor?: number
      limit?: number
    }) => Promise<Result<{ items: readonly T[]; nextCursor: string | null }>>,
  ): Promise<Result<readonly T[]>> => {
    const items: T[] = []
    let cursor: number | undefined
    const cursors = new Set<number>()
    for (;;) {
      const page = await read({ cursor, limit: 100 })
      if (!page.success) return page
      items.push(...page.data.items)
      if (page.data.nextCursor === null) return { success: true, data: items }
      const nextCursor = Number(page.data.nextCursor)
      if (!Number.isSafeInteger(nextCursor) || cursors.has(nextCursor))
        return resultFailure("assetsApiClientPageReadAll", "The service returned a repeating pagination cursor")
      cursors.add(nextCursor)
      cursor = nextCursor
    }
  }

  const healthRead = () =>
    requestRead({
      path: "/health",
      responseSchema: healthResponseSchema,
      operation: "assetsApiClientHealthRead",
      authenticated: false,
    })
  const readyRead = () =>
    requestRead({
      path: "/ready",
      responseSchema: healthResponseSchema,
      operation: "assetsApiClientReadyRead",
      authenticated: false,
    })

  const authLogin = (returnTo = "/") =>
    requestRead({
      path: "/auth/login",
      query: { returnTo },
      responseSchema: authLoginResponseSchema,
      operation: "assetsApiClientAuthLogin",
      authenticated: false,
    })

  const authSessionRead = () =>
    requestRead({
      path: "/auth/session",
      responseSchema: authSessionResponseSchema,
      operation: "assetsApiClientAuthSessionRead",
    })

  const authLogout = () =>
    requestRead({
      path: "/auth/logout",
      method: "POST",
      responseSchema: v.strictObject({ loggedOut: v.boolean() }),
      operation: "assetsApiClientAuthLogout",
    })

  const projectsRead = async (query: { cursor?: number; limit?: number; search?: string } = {}) => {
    const valid = schemaParse(
      projectListInputSchema,
      query,
      "assetsApiClientProjectsRead",
      "The project query was invalid",
    )
    if (!valid.success) return valid
    return requestRead({
      path: "/projects",
      query: valid.data as Query,
      responseSchema: projectListResponseSchema,
      operation: "assetsApiClientProjectsRead",
    })
  }

  const projectsReadAll = () =>
    pageReadAll(async (query) => {
      const page = await projectsRead(query)
      if (!page.success) return page
      return { success: true, data: { items: page.data.projects, nextCursor: page.data.page.nextCursor } }
    })

  const projectRead = (projectId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}`,
      responseSchema: projectSchema,
      operation: "assetsApiClientProjectRead",
    })

  const projectSettingsRead = (projectId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/settings`,
      responseSchema: projectSettingsSchema,
      operation: "assetsApiClientProjectSettingsRead",
    })

  const projectSettingsWrite = (projectId: string, input: unknown) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/settings`,
      method: "PUT",
      body: input,
      bodySchema: projectSettingsUpdateSchema,
      responseSchema: projectSettingsSchema,
      operation: "assetsApiClientProjectSettingsWrite",
    })

  const environmentsRead = (projectId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/environments`,
      responseSchema: environmentsResponseSchema,
      operation: "assetsApiClientEnvironmentsRead",
    })

  const environmentRead = (projectId: string, environment: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environment)}`,
      responseSchema: environmentSchema,
      operation: "assetsApiClientEnvironmentRead",
    })

  const uploadIntentCreate = (projectId: string, input: unknown) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/uploads/intent`,
      method: "POST",
      body: input,
      bodySchema: uploadIntentRequestSchema,
      responseSchema: uploadIntentResponseSchema,
      operation: "assetsApiClientUploadIntentCreate",
    })

  const uploadObjectPut = async (intent: unknown, bytes: Uint8Array): Promise<Result<true>> => {
    const parsed = schemaParse<import("../storage/storageUploadIntentSchema.js").StorageUploadIntent>(
      storageUploadIntentSchema,
      intent,
      "assetsApiClientUploadObjectPut",
      "The upload intent was invalid",
    )
    if (!parsed.success) return parsed
    if (bytes.byteLength !== parsed.data.byteSize)
      return resultFailure("assetsApiClientUploadObjectPut", "The upload size did not match the upload intent")

    let response: Response
    try {
      response = await fetcher(parsed.data.url, {
        method: parsed.data.method,
        headers: { "content-type": parsed.data.mediaType },
        body: bytes as unknown as ArrayBuffer,
      })
    } catch {
      return resultFailure("assetsApiClientUploadObjectPut", "The direct upload could not be reached", {
        code: "service_unavailable",
      })
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      return resultFailure(
        "assetsApiClientUploadObjectPut",
        `The direct upload was rejected (${response.status}): ${body.slice(0, 500)}`,
        {
          status: response.status,
        },
      )
    }
    return { success: true, data: true }
  }

  const uploadCompletionComplete = (projectId: string, uploadId: string, input: unknown) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/uploads/${encodeURIComponent(uploadId)}/complete`,
      method: "POST",
      body: input,
      bodySchema: uploadCompletionRequestSchema,
      responseSchema: uploadCompletionResponseSchema,
      operation: "assetsApiClientUploadCompletionComplete",
    })

  const uploadRead = (projectId: string, uploadId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/uploads/${encodeURIComponent(uploadId)}`,
      responseSchema: uploadSchema,
      operation: "assetsApiClientUploadRead",
    })

  const assetListRead = async (
    projectId: string,
    query: { cursor?: number; limit?: number; class?: string; include?: string; search?: string; folder?: string } = {},
  ) => {
    const valid = schemaParse(
      assetListInputSchema,
      query,
      "assetsApiClientAssetListRead",
      "The asset query was invalid",
    )
    if (!valid.success) return valid
    return requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/assets`,
      query: valid.data as Query,
      responseSchema: assetListResponseSchema,
      operation: "assetsApiClientAssetListRead",
    })
  }

  const assetsReadAll = (
    projectId: string,
    query: { class?: string; include?: string; search?: string; folder?: string } = {},
  ) =>
    pageReadAll(async (pageQuery) => {
      const page = await assetListRead(projectId, { ...query, ...pageQuery })
      if (!page.success) return page
      return { success: true, data: { items: page.data.assets, nextCursor: page.data.page.nextCursor } }
    })

  const assetRead = (projectId: string, assetId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
      responseSchema: assetDetailResponseSchema,
      operation: "assetsApiClientAssetRead",
    })

  const assetSourceRevisionContentUrlCreate = (
    projectId: string,
    assetId: string,
    sourceRevisionId: string,
    mode: SourceRevisionContentMode = "download",
  ) =>
    apiUrlCreate(
      `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/source-revisions/${encodeURIComponent(sourceRevisionId)}/content`,
      { mode },
    )

  const assetOutputVersionContentUrlCreate = (projectId: string, assetId: string, outputVersionId: string) =>
    apiUrlCreate(
      `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/outputs/${encodeURIComponent(outputVersionId)}/content`,
    )

  const assetOutputsRead = (projectId: string, assetId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/outputs`,
      responseSchema: outputListResponseSchema,
      operation: "assetsApiClientAssetOutputsRead",
    })

  const assetOutputAdd = (projectId: string, assetId: string, input: unknown) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/outputs`,
      method: "POST",
      body: input,
      bodySchema: outputAddRequestSchema,
      responseSchema: outputMutationResponseSchema,
      operation: "assetsApiClientAssetOutputAdd",
    })

  const assetOutputsSet = (projectId: string, assetId: string, input: unknown) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/outputs`,
      method: "PUT",
      body: input,
      bodySchema: outputSetRequestSchema,
      responseSchema: outputMutationResponseSchema,
      operation: "assetsApiClientAssetOutputsSet",
    })

  const assetOutputRemove = (projectId: string, assetId: string, input: unknown) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/outputs`,
      method: "DELETE",
      body: input,
      bodySchema: outputRemoveRequestSchema,
      responseSchema: outputMutationResponseSchema,
      operation: "assetsApiClientAssetOutputRemove",
    })

  const assetMetadataSet = (projectId: string, assetId: string, input: unknown) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/metadata`,
      method: "PATCH",
      body: input,
      bodySchema: metadataSetRequestSchema,
      responseSchema: assetDetailResponseSchema,
      operation: "assetsApiClientAssetMetadataSet",
    })

  const assetMetadataUnset = (projectId: string, assetId: string, input: unknown = { field: "alt" }) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/metadata/unset`,
      method: "POST",
      body: input,
      bodySchema: metadataUnsetRequestSchema,
      responseSchema: assetDetailResponseSchema,
      operation: "assetsApiClientAssetMetadataUnset",
    })

  const assetMove = (projectId: string, assetId: string, input: unknown) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/move`,
      method: "POST",
      body: input,
      bodySchema: moveAssetRequestSchema,
      responseSchema: assetDetailResponseSchema,
      operation: "assetsApiClientAssetMove",
    })

  const structureRead = (projectId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/structure`,
      responseSchema: structureResponseSchema,
      operation: "assetsApiClientStructureRead",
    })

  const structureFolderCreate = (projectId: string, input: unknown) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/structure/folders`,
      method: "POST",
      body: input,
      bodySchema: structureFolderCreateInputSchema,
      responseSchema: structureFolderSchema,
      operation: "assetsApiClientStructureFolderCreate",
    })

  const assetStructureFolderMembershipSet = (projectId: string, assetId: string, input: unknown) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/structure-membership`,
      method: "PUT",
      body: input,
      bodySchema: assetStructureFolderMembershipSetRequestSchema,
      responseSchema: v.nullable(assetStructureFolderMembershipSchema),
      operation: "assetsApiClientAssetStructureFolderMembershipSet",
    })

  const assetDeleteRequest = (projectId: string, assetId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/deletion-request`,
      method: "POST",
      body: {},
      bodySchema: v.strictObject({}),
      responseSchema: deletionRequestResponseSchema,
      operation: "assetsApiClientAssetDeleteRequest",
    })

  const deletionStatusRead = (projectId: string, assetId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/deletion-status`,
      responseSchema: deletionStatusResponseSchema,
      operation: "assetsApiClientDeletionStatusRead",
    })

  // The route already answers `null` for an asset that was never asked to be
  // deleted. The optional wrapper stays so an older service that still answers
  // 404 keeps working.
  const deletionStatusOptionalRead = async (projectId: string, assetId: string) =>
    assetsApiResultOptionalRead(await deletionStatusRead(projectId, assetId))

  const sourceRevisionDeletionEligibilityRead = async (
    projectId: string,
    environment: string,
    sourceRevisionId: string,
  ) => {
    const validEnvironment = schemaParse(
      environmentNameSchema,
      environment,
      "assetsApiClientSourceRevisionDeletionEligibilityRead",
      "The target environment was invalid",
    )
    if (!validEnvironment.success) return validEnvironment
    return requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/source-revisions/${encodeURIComponent(sourceRevisionId)}/deletion-eligibility`,
      query: { environment: validEnvironment.data as "development" | "production" },
      responseSchema: sourceRevisionDeletionEligibilityResponseSchema,
      operation: "assetsApiClientSourceRevisionDeletionEligibilityRead",
    })
  }

  const workflowStatusRead = (projectId: string, workflowId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/workflows/${encodeURIComponent(workflowId)}/status`,
      responseSchema: workflowSchema,
      operation: "assetsApiClientWorkflowStatusRead",
    })

  const importRequestCreate = (projectId: string, input: unknown) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/imports`,
      method: "POST",
      body: input,
      bodySchema: legacyImportRequestSchema,
      responseSchema: legacyImportResponseSchema,
      operation: "assetsApiClientImportRequestCreate",
    })

  const importStatusRead = (projectId: string, importId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/imports/${encodeURIComponent(importId)}/status`,
      responseSchema: legacyImportResponseSchema,
      operation: "assetsApiClientImportStatusRead",
    })

  const catalogCurrentRead = (projectId: string, environment: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/catalogs/${encodeURIComponent(environment)}/current`,
      responseSchema: catalogResponseSchema,
      operation: "assetsApiClientCatalogCurrentRead",
    })

  const catalogCurrentOptionalRead = async (projectId: string, environment: string) =>
    assetsApiResultOptionalRead(await catalogCurrentRead(projectId, environment))

  const catalogListsRead = (projectId: string, environment: string, query: { generationId?: string } = {}) => {
    const valid = schemaParse(
      catalogListInputSchema,
      query,
      "assetsApiClientCatalogListsRead",
      "The catalog query was invalid",
    )
    if (!valid.success) return valid
    return requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/catalogs/${encodeURIComponent(environment)}/lists`,
      query: valid.data as Query,
      responseSchema: generatedListsResponseSchema,
      operation: "assetsApiClientCatalogListsRead",
    })
  }

  const catalogListsOptionalRead = async (projectId: string, environment: string) =>
    assetsApiResultOptionalRead(await catalogListsRead(projectId, environment))

  const backupListRead = (
    projectId: string,
    query: { cursor?: number; limit?: number; assetId?: string; sourceRevisionId?: string } = {},
  ) => {
    const valid = schemaParse(
      backupListInputSchema,
      query,
      "assetsApiClientBackupListRead",
      "The backup query was invalid",
    )
    if (!valid.success) return valid
    return requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/backups`,
      query: valid.data as Query,
      responseSchema: backupListResponseSchema,
      operation: "assetsApiClientBackupListRead",
    })
  }

  const assetHistoryRead = (projectId: string, assetId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/history`,
      responseSchema: assetHistoryResponseSchema,
      operation: "assetsApiClientAssetHistoryRead",
    })

  const workflowListRead = (
    projectId: string,
    query: { cursor?: number; limit?: number; status?: string; kind?: string; assetId?: string } = {},
  ) => {
    const valid = schemaParse(
      workflowListInputSchema,
      query,
      "assetsApiClientWorkflowListRead",
      "The workflow query was invalid",
    )
    if (!valid.success) return valid
    return requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/workflows`,
      query: valid.data as Query,
      responseSchema: workflowListResponseSchema,
      operation: "assetsApiClientWorkflowListRead",
    })
  }

  const workflowRead = (projectId: string, workflowId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/workflows/${encodeURIComponent(workflowId)}`,
      responseSchema: workflowResponseSchema,
      operation: "assetsApiClientWorkflowRead",
    })

  const workflowRetry = (projectId: string, workflowId: string, input: unknown = {}) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/workflows/${encodeURIComponent(workflowId)}/retry`,
      method: "POST",
      body: input,
      bodySchema: workflowActionRequestSchema,
      responseSchema: workflowResponseSchema,
      operation: "assetsApiClientWorkflowRetry",
    })

  const workflowCancel = (projectId: string, workflowId: string, input: unknown = {}) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/workflows/${encodeURIComponent(workflowId)}/cancel`,
      method: "POST",
      body: input,
      bodySchema: workflowActionRequestSchema,
      responseSchema: workflowResponseSchema,
      operation: "assetsApiClientWorkflowCancel",
    })

  const jobListRead = (
    projectId: string,
    query: { cursor?: number; limit?: number; status?: string; kind?: string; workflowId?: string } = {},
  ) => {
    const valid = schemaParse(jobListInputSchema, query, "assetsApiClientJobListRead", "The job query was invalid")
    if (!valid.success) return valid
    return requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/jobs`,
      query: valid.data as Query,
      responseSchema: jobListResponseSchema,
      operation: "assetsApiClientJobListRead",
    })
  }

  const jobRead = (projectId: string, jobId: string) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`,
      responseSchema: jobResponseSchema,
      operation: "assetsApiClientJobRead",
    })

  const jobRetry = (projectId: string, jobId: string, input: unknown = {}) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/retry`,
      method: "POST",
      body: input,
      bodySchema: jobActionRequestSchema,
      responseSchema: jobResponseSchema,
      operation: "assetsApiClientJobRetry",
    })

  const jobCancel = (projectId: string, jobId: string, input: unknown = {}) =>
    requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/cancel`,
      method: "POST",
      body: input,
      bodySchema: jobActionRequestSchema,
      responseSchema: jobResponseSchema,
      operation: "assetsApiClientJobCancel",
    })

  const catalogHistoryRead = (
    projectId: string,
    environment: string,
    query: { cursor?: number; limit?: number } = {},
  ) => {
    const valid = schemaParse(
      catalogListInputSchema,
      query,
      "assetsApiClientCatalogHistoryRead",
      "The catalog query was invalid",
    )
    if (!valid.success) return valid
    return requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/catalogs/${encodeURIComponent(environment)}/history`,
      query: valid.data as Query,
      responseSchema: catalogHistoryResponseSchema,
      operation: "assetsApiClientCatalogHistoryRead",
    })
  }

  const importListRead = (projectId: string, query: { cursor?: number; limit?: number; status?: string } = {}) => {
    const valid = schemaParse(
      importListInputSchema,
      query,
      "assetsApiClientImportListRead",
      "The import query was invalid",
    )
    if (!valid.success) return valid
    return requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/imports`,
      query: valid.data as Query,
      responseSchema: legacyImportListResponseSchema,
      operation: "assetsApiClientImportListRead",
    })
  }

  const auditEventListRead = (
    projectId: string,
    query: {
      cursor?: number
      limit?: number
      actorId?: string
      action?: string
      resourceType?: string
      resourceId?: string
    } = {},
  ) => {
    const valid = schemaParse(
      auditEventListInputSchema,
      query,
      "assetsApiClientAuditEventListRead",
      "The audit query was invalid",
    )
    if (!valid.success) return valid
    return requestRead({
      path: `/projects/${encodeURIComponent(projectId)}/audit-events`,
      query: valid.data as Query,
      responseSchema: auditEventListResponseSchema,
      operation: "assetsApiClientAuditEventListRead",
    })
  }

  const importWait = async (
    projectId: string,
    importId: string,
  ): Promise<Result<import("../import/legacyImportStatusSchema.js").LegacyImportStatus>> => {
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      const status = await importStatusRead(projectId, importId)
      if (!status.success) return status
      if (["succeeded", "failed", "cancelled"].includes(status.data.import.status))
        return { success: true, data: status.data.import }
      await sleep(pollIntervalMilliseconds)
    }
    return resultFailure("assetsApiClientImportWait", "The import did not finish before the polling limit")
  }

  const workflowWait = async (projectId: string, workflowId: string) => {
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      const status = await workflowStatusRead(projectId, workflowId)
      if (!status.success) return status
      if (["succeeded", "failed", "cancelled"].includes(status.data.status)) return status
      await sleep(pollIntervalMilliseconds)
    }
    return resultFailure("assetsApiClientWorkflowWait", "The workflow did not finish before the polling limit")
  }

  const deletionWait = async (projectId: string, assetId: string): Promise<Result<DeletionState>> => {
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      const status = await deletionStatusRead(projectId, assetId)
      if (!status.success) return status
      if (status.data === null)
        return resultFailure("assetsApiClientDeletionWait", "No deletion was requested for this asset")
      if (["succeeded", "failed"].includes(status.data.status)) return { success: true, data: status.data }
      await sleep(pollIntervalMilliseconds)
    }
    return resultFailure("assetsApiClientDeletionWait", "The deletion did not finish before the polling limit")
  }

  const client = {
    authLogin,
    authLogout,
    authSessionRead,
    healthRead,
    readyRead,
    projectsRead,
    projectsReadAll,
    projectRead,
    projectSettingsRead,
    projectSettingsWrite,
    environmentsRead,
    environmentRead,
    uploadIntentCreate,
    uploadObjectPut,
    uploadCompletionComplete,
    uploadRead,
    assetListRead,
    assetsReadAll,
    assetRead,
    assetSourceRevisionContentUrlCreate,
    assetOutputVersionContentUrlCreate,
    assetHistoryRead,
    assetOutputsRead,
    assetOutputAdd,
    assetOutputsSet,
    assetOutputRemove,
    assetMetadataSet,
    assetMetadataUnset,
    assetMove,
    structureRead,
    structureFolderCreate,
    assetStructureFolderMembershipSet,
    assetDeleteRequest,
    deletionStatusRead,
    deletionStatusOptionalRead,
    sourceRevisionDeletionEligibilityRead,
    workflowStatusRead,
    workflowListRead,
    workflowRead,
    workflowRetry,
    workflowCancel,
    jobListRead,
    jobRead,
    jobRetry,
    jobCancel,
    importRequestCreate,
    importStatusRead,
    importListRead,
    catalogCurrentRead,
    catalogCurrentOptionalRead,
    catalogListsRead,
    catalogListsOptionalRead,
    catalogHistoryRead,
    backupListRead,
    auditEventListRead,
    importWait,
    workflowWait,
    deletionWait,
  }
  return { success: true as const, data: client }
}
