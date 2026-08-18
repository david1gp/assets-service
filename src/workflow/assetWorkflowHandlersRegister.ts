import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { and, asc, eq } from "drizzle-orm"
import * as v from "valibot"

import type { Folders } from "../asset/foldersSchema.js"
import { backupOriginal } from "../backup/backupOriginal.js"
import { backupReceiptRepositoryCreate } from "../backup/backupReceiptRepositoryCreate.js"
import type { RcloneBackupAdapter } from "../backup/rcloneBackupAdapter.js"
import type { RcloneBackupDeleteAdapter } from "../backup/rcloneBackupDeleteAdapter.js"
import { canonicalJsonDigest } from "../catalog/canonicalJsonDigest.js"
import { canonicalJsonStringify } from "../catalog/canonicalJsonStringify.js"
import { catalogEntryPropertyCreate } from "../catalog/catalogEntryPropertyCreate.js"
import { catalogSchema } from "../catalog/catalogSchema.js"
import { assetDeletionHandle } from "../deletion/assetDeletionHandle.js"
import { legacyImportProgressReconcile } from "../import/legacyImportProgressReconcile.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { backupReceiptTable } from "../infrastructure/db/schema/backupReceiptTable.js"
import { blobTable } from "../infrastructure/db/schema/blobTable.js"
import { catalogGenerationTable } from "../infrastructure/db/schema/catalogGenerationTable.js"
import { catalogOutputTable } from "../infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../infrastructure/db/schema/catalogTable.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { jobDependencyTable } from "../infrastructure/db/schema/jobDependencyTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { manifestTable } from "../infrastructure/db/schema/manifestTable.js"
import { organizationTable } from "../infrastructure/db/schema/organizationTable.js"
import { outboxEventTable } from "../infrastructure/db/schema/outboxEventTable.js"
import { outputDefinitionTable } from "../infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../infrastructure/db/schema/outputVersionTable.js"
import { projectTable } from "../infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../infrastructure/db/schema/sourceRevisionTable.js"
import { uploadTable } from "../infrastructure/db/schema/uploadTable.js"
import type { MediaMetadata } from "../metadata/mediaMetadataSchema.js"
import { mediaMetadataSchema } from "../metadata/mediaMetadataSchema.js"
import { outputRemoteObjectKeyCreate } from "../output/outputRemoteObjectKeyCreate.js"
import { outputVersionRepositoryAllocate } from "../output/outputVersionRepositoryAllocate.js"
import { documentMediaTypeSchema } from "../document/documentMediaTypeSchema.js"
import { documentProcess } from "../processing/documentProcess.js"
import { fontProcess } from "../processing/fontProcess.js"
import type { FontProcessingAdapter } from "../processing/fontProcessingAdapter.js"
import { imageProcess } from "../processing/imageProcess.js"
import type { ImageProcessingAdapter } from "../processing/imageProcessingAdapter.js"
import { videoProcess } from "../processing/videoProcess.js"
import type { VideoProcessingAdapter } from "../processing/videoProcessingAdapter.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import { storageBindingResolve } from "../storage/storageBindingResolve.js"
import { storageCopyImmutable } from "../storage/storageCopyImmutable.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import type { StorageObject } from "../storage/storageObjectSchema.js"
import { storageObjectVerify } from "../storage/storageObjectVerify.js"
import { storagePutImmutable } from "../storage/storagePutImmutable.js"
import type { JobHandler } from "./jobHandler.js"
import { jobHandlerRegistryCreate } from "./jobHandlerRegistryCreate.js"
import { type JobPayload, jobPayloadSchema } from "./jobPayloadSchema.js"
import { jobRepositoryPayloadUpdate } from "./jobRepositoryPayloadUpdate.js"
import { type Job, jobSchema } from "./jobSchema.js"
import { workflowJobCreate } from "./workflowJobCreate.js"

type AssetWorkflowHandlersRegisterInput = {
  db: AssetDatabase
  storage: StorageAdapter
  backup: RcloneBackupAdapter
  backupDelete?: RcloneBackupDeleteAdapter
  clock?: () => Date
  imageProcessor?: ImageProcessingAdapter
  videoProcessor?: VideoProcessingAdapter
  fontProcessor?: FontProcessingAdapter
  temporaryDirectory?: string
  adminBaseUrl?: string
}

type HandlerRegistry = ReturnType<typeof jobHandlerRegistryCreate>

type AssetContext = {
  asset: typeof assetTable.$inferSelect
  source: typeof sourceRevisionTable.$inferSelect
  environment: typeof environmentTable.$inferSelect
  binding: ReturnType<typeof storageBindingResolve> extends Result<infer T> ? T : never
}

type PublishedOutput = {
  version: typeof outputVersionTable.$inferSelect
  definition: typeof outputDefinitionTable.$inferSelect
  metadata: MediaMetadata
}

const processKinds = new Set<Job["kind"]>([
  "process_image_output",
  "copy_video_output",
  "process_font_output",
  "process_document_output",
])

export const assetWorkflowHandlersRegister = (
  registry: HandlerRegistry,
  input: AssetWorkflowHandlersRegisterInput,
): Result<null> => {
  const handlers: Array<[Job["kind"], JobHandler]> = [
    ["verify_original", (job, context) => verifyOriginalHandle(job, context, input)],
    ["backup_original", (job, context) => backupOriginalHandle(job, context, input)],
    ["plan_outputs", (job, context) => planOutputsHandle(job, context, input)],
    ["process_image_output", (job, context) => processOutputHandle(job, context, input)],
    ["copy_video_output", (job, context) => processOutputHandle(job, context, input)],
    ["process_font_output", (job, context) => processOutputHandle(job, context, input)],
    ["process_document_output", (job, context) => processOutputHandle(job, context, input)],
    ["publish_asset", (job, context) => publishAssetHandle(job, context, input)],
    ["notify_customer_upload", (job, context) => notifyCustomerUploadHandle(job, context, input)],
    ["cleanup_local_files", (job, context) => cleanupLocalFilesHandle(job, context, input)],
    ["delete_asset", (job, context) => assetDeletionHandle(job, context, input)],
  ]
  for (const [kind, handler] of handlers) {
    const registered = registry.register(kind, handler)
    if (!registered.success) return registered
  }
  return { success: true, data: null }
}

async function verifyOriginalHandle(
  job: Job,
  _context: Parameters<JobHandler>[1],
  input: AssetWorkflowHandlersRegisterInput,
): Promise<Result<null>> {
  const context = await assetContextRead(input.db, job)
  if (!context.success) return context
  const sourceLocation = sourceLocationCreate(context.data.binding, context.data.source.objectKey)
  if (!sourceLocation.success) return sourceLocation
  const verified = await storageObjectVerify(input.storage, {
    location: sourceLocation.data,
    byteSize: context.data.source.byteSize,
    sha256: context.data.source.sha256,
    mediaType: context.data.source.mediaType,
  })
  if (!verified.success) return verified
  return { success: true, data: null }
}

async function backupOriginalHandle(
  job: Job,
  handlerContext: Parameters<JobHandler>[1],
  input: AssetWorkflowHandlersRegisterInput,
): Promise<Result<null>> {
  const context = await assetContextRead(input.db, job)
  if (!context.success) return context
  const existing = input.db
    .select()
    .from(backupReceiptTable)
    .where(eq(backupReceiptTable.sourceRevisionId, context.data.source.id))
    .all()
    .find(
      (receipt) =>
        receipt.projectId === context.data.asset.projectId &&
        receipt.checkResult === "verified" &&
        receipt.byteSize === context.data.source.byteSize &&
        receipt.sha256 === context.data.source.sha256 &&
        receipt.remotePath.startsWith("gdrive_beta:"),
    )
  if (existing !== undefined) return { success: true, data: null }

  const project = input.db.select().from(projectTable).where(eq(projectTable.id, context.data.asset.projectId)).get()
  if (project === undefined) return resultErrorCreate("backupOriginalHandle", "Project not found")
  const organization = input.db
    .select()
    .from(organizationTable)
    .where(eq(organizationTable.id, project.organizationId))
    .get()
  if (organization === undefined) return resultErrorCreate("backupOriginalHandle", "Organization not found")
  const sourceLocation = sourceLocationCreate(context.data.binding, context.data.source.objectKey)
  if (!sourceLocation.success) return sourceLocation
  const sourceBytes = await input.storage.readObject(sourceLocation.data)
  if (!sourceBytes.success) return sourceBytes
  if (sourceBytes.data === null)
    return resultErrorCreate("backupOriginalHandle", "Private source object does not exist")

  const temporaryDirectory = input.temporaryDirectory ?? tmpdir()
  const temporaryPath = join(temporaryDirectory, `assets-service-${context.data.source.id}-${job.id}`)
  try {
    await Bun.write(temporaryPath, sourceBytes.data)
    const backup = await backupOriginal(
      {
        localSourcePath: temporaryPath,
        projectId: context.data.asset.projectId,
        sourceRevisionId: context.data.source.id,
        jobId: job.id,
        organizationName: organization.slug,
        projectName: project.slug,
        logicalFolders: foldersRead(context.data.asset),
        originalFilename: context.data.source.originalFilename,
        expectedByteSize: context.data.source.byteSize,
        expectedSha256: context.data.source.sha256,
      },
      input.backup,
      {
        signal: handlerContext.signal,
        receiptId: `backup-${context.data.source.id}`,
        existingReceipt: existing,
      },
    )
    if (!backup.success) return backup
    const receipt = backupReceiptRepositoryCreate(input.db, backup.data)
    if (receipt.success) return { success: true, data: null }
    const raced = input.db
      .select()
      .from(backupReceiptTable)
      .where(eq(backupReceiptTable.sourceRevisionId, context.data.source.id))
      .all()
      .find((candidate) => candidate.checkResult === "verified" && candidate.sha256 === context.data.source.sha256)
    if (raced !== undefined) return { success: true, data: null }
    return receipt
  } catch (error) {
    return resultErrorCreate("backupOriginalHandle", error instanceof Error ? error.message : String(error))
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

async function planOutputsHandle(
  job: Job,
  _context: Parameters<JobHandler>[1],
  input: AssetWorkflowHandlersRegisterInput,
): Promise<Result<null>> {
  const op = "planOutputsHandle"
  const context = await assetContextRead(input.db, job)
  if (!context.success) return context
  const definitions = input.db
    .select()
    .from(outputDefinitionTable)
    .where(eq(outputDefinitionTable.assetId, context.data.asset.id))
    .orderBy(asc(outputDefinitionTable.key))
    .all()
  if (definitions.length === 0)
    return resultErrorCreate(op, `Asset ${context.data.asset.id} requires at least one output definition`)
  if (definitions.some((definition) => definition.kind !== context.data.asset.class))
    return resultErrorCreate(op, "Output definition class does not match the asset class")

  const parsedPayload = jobPayloadRead(job)
  if (!parsedPayload.success) return parsedPayload
  const workflowJobs = input.db.select().from(jobTable).where(eq(jobTable.workflowId, job.workflowId)).all()
  const outputDefinitionIds = new Set(definitions.map((definition) => definition.id))
  const outputJobs = workflowJobs.filter((candidate) => processKinds.has(candidate.kind))
  for (const outputJob of outputJobs) {
    const payload = jobPayloadRead(outputJob)
    if (!payload.success) return payload
    if (payload.data.outputDefinitionId === undefined || !outputDefinitionIds.has(payload.data.outputDefinitionId))
      return resultErrorCreate(op, "Output plan contains a job for a missing output definition")
  }

  const publishJob = workflowJobs.find((candidate) => candidate.kind === "publish_asset")
  if (publishJob === undefined) return resultErrorCreate(op, "Output plan is missing its publication job")

  const outputJobsByDefinition = new Map<string, Job>()
  for (const outputJob of outputJobs) {
    const payload = jobPayloadRead(outputJob)
    if (!payload.success) return payload
    if (payload.data.outputDefinitionId === undefined)
      return resultErrorCreate(op, "Output job is missing its definition")
    if (outputJobsByDefinition.has(payload.data.outputDefinitionId))
      return resultErrorCreate(op, "Output plan contains duplicate output jobs")
    outputJobsByDefinition.set(payload.data.outputDefinitionId, outputJob)
  }

  const reconciled = databaseTransactionRun<null>(
    input.db,
    (transaction) => {
      for (const definition of definitions) {
        const expectedKind =
          definition.kind === "image"
            ? "process_image_output"
            : definition.kind === "video"
              ? "copy_video_output"
              : definition.kind === "font"
                ? "process_font_output"
                : "process_document_output"
        const expectedId = `${job.workflowId}-output-${definition.id}`
        const existing = outputJobsByDefinition.get(definition.id)
        const outputJob = existing ?? transaction.select().from(jobTable).where(eq(jobTable.id, expectedId)).get()
        if (outputJob !== undefined && outputJob.kind !== expectedKind)
          return resultErrorCreate(op, `Output job kind does not match definition: ${definition.id}`)

        if (outputJob === undefined) {
          const inserted = databaseRecordInsert(
            transaction,
            jobTable,
            workflowJobCreate({
              id: expectedId,
              workflowId: job.workflowId,
              kind: expectedKind,
              payload: { ...parsedPayload.data, outputDefinitionId: definition.id },
              now: input.clock?.().toISOString() ?? new Date().toISOString(),
              retryLimit: job.retryLimit,
            }),
          )
          if (!inserted.success) return inserted
        }

        const resolvedOutputJob =
          outputJob ?? transaction.select().from(jobTable).where(eq(jobTable.id, expectedId)).get()
        if (resolvedOutputJob === undefined) return resultErrorCreate(op, "Output job disappeared during planning")
        const outputDependency = jobDependencyCreate(
          `${resolvedOutputJob.id}-dependency-plan`,
          resolvedOutputJob.id,
          job.id,
          input.clock?.().toISOString() ?? new Date().toISOString(),
        )
        const outputDependencyResult = jobDependencyEnsure(transaction, outputDependency)
        if (!outputDependencyResult.success) return outputDependencyResult
        const publishDependency = jobDependencyCreate(
          `${publishJob.id}-dependency-${resolvedOutputJob.id}`,
          publishJob.id,
          resolvedOutputJob.id,
          input.clock?.().toISOString() ?? new Date().toISOString(),
        )
        const publishDependencyResult = jobDependencyEnsure(transaction, publishDependency)
        if (!publishDependencyResult.success) return publishDependencyResult
      }

      const planDependency = jobDependencyCreate(
        `${publishJob.id}-dependency-plan`,
        publishJob.id,
        job.id,
        input.clock?.().toISOString() ?? new Date().toISOString(),
      )
      return jobDependencyEnsure(transaction, planDependency)
    },
    { behavior: "immediate" },
  )
  if (!reconciled.success) return reconciled
  return { success: true, data: null }
}

async function notifyCustomerUploadHandle(
  job: Job,
  _handlerContext: Parameters<JobHandler>[1],
  input: AssetWorkflowHandlersRegisterInput,
): Promise<Result<null>> {
  const op = "notifyCustomerUploadHandle"
  const context = await assetContextRead(input.db, job)
  if (!context.success) return context
  const parsedPayload = jobPayloadRead(job)
  if (!parsedPayload.success) return parsedPayload
  if (parsedPayload.data.uploadId === undefined) return resultErrorCreate(op, "Notification job is missing its upload")
  const upload = input.db.select().from(uploadTable).where(eq(uploadTable.id, parsedPayload.data.uploadId)).get()
  if (upload === undefined) return resultErrorCreate(op, "Upload not found for notification")
  if (upload.assetId !== context.data.asset.id || upload.sourceRevisionId !== context.data.source.id)
    return resultErrorCreate(op, "Notification upload does not match the asset")
  if (upload.status !== "accepted") return resultErrorCreate(op, "Only accepted uploads can create notifications")
  if (!upload.notificationEligible) return { success: true, data: null }

  const eventId = `customer-asset-uploaded:${upload.id}`
  const existing = input.db.select().from(outboxEventTable).where(eq(outboxEventTable.eventId, eventId)).get()
  if (existing !== undefined) {
    if (existing.kind !== "customer_asset_uploaded")
      return resultErrorCreate(op, "Notification event id is already in use")
    return { success: true, data: null }
  }

  const project = input.db.select().from(projectTable).where(eq(projectTable.id, context.data.asset.projectId)).get()
  if (project === undefined) return resultErrorCreate(op, "Project not found for notification")
  const organization = input.db
    .select()
    .from(organizationTable)
    .where(eq(organizationTable.id, project.organizationId))
    .get()
  if (organization === undefined) return resultErrorCreate(op, "Organization not found for notification")
  const now = input.clock?.().toISOString() ?? new Date().toISOString()
  const currentOutput = input.db
    .select({ objectKey: outputVersionTable.objectKey })
    .from(outputVersionTable)
    .where(and(eq(outputVersionTable.assetId, context.data.asset.id), eq(outputVersionTable.current, true)))
    .orderBy(asc(outputVersionTable.objectKey))
    .limit(1)
    .get()
  const previewUrl =
    currentOutput === undefined
      ? undefined
      : publicUrlCreate(context.data.environment.publicBaseUrl, currentOutput.objectKey)
  const adminBaseUrl = input.adminBaseUrl ?? "https://assets-service.invalid"
  const adminUrl = deepLinkCreate(adminBaseUrl, `/projects/${project.id}/assets/${context.data.asset.id}`)
  const inserted = databaseRecordInsert(input.db, outboxEventTable, {
    id: `outbox-${upload.id}-customer-asset-uploaded`,
    eventId,
    kind: "customer_asset_uploaded",
    payload: {
      eventType: "customer_asset_uploaded",
      eventId,
      uploadId: upload.id,
      assetId: context.data.asset.id,
      sourceRevisionId: context.data.source.id,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      projectId: project.id,
      projectSlug: project.slug,
      uploaderId: upload.uploaderId ?? "unknown",
      originalFilename: upload.originalFilename,
      integrationNote: upload.integrationNote,
      uploadedAt: upload.verifiedAt ?? upload.createdAt,
      ...(previewUrl === undefined ? {} : { previewUrl }),
      adminUrl,
    },
    status: "pending",
    attempts: 0,
    availableAt: now,
    deliveredAt: null,
    lastError: null,
    createdAt: now,
  })
  if (!inserted.success) {
    const raced = input.db.select().from(outboxEventTable).where(eq(outboxEventTable.eventId, eventId)).get()
    if (raced?.kind === "customer_asset_uploaded") return { success: true, data: null }
    return inserted
  }
  return { success: true, data: null }
}

function deepLinkCreate(baseUrl: string, path: string): string {
  try {
    return new URL(path, `${baseUrl.replace(/\/$/, "")}/`).toString()
  } catch {
    return `https://assets-service.invalid${path}`
  }
}

function publicUrlCreate(baseUrl: string, objectKey: string): string {
  return deepLinkCreate(baseUrl, `/${objectKey}`)
}

async function cleanupLocalFilesHandle(
  job: Job,
  _handlerContext: Parameters<JobHandler>[1],
  input: AssetWorkflowHandlersRegisterInput,
): Promise<Result<null>> {
  const op = "cleanupLocalFilesHandle"
  const context = await assetContextRead(input.db, job)
  if (!context.success) return context
  const backup = input.db
    .select()
    .from(backupReceiptTable)
    .where(eq(backupReceiptTable.sourceRevisionId, context.data.source.id))
    .all()
    .find(
      (receipt) =>
        receipt.projectId === context.data.asset.projectId &&
        receipt.checkResult === "verified" &&
        receipt.byteSize === context.data.source.byteSize &&
        receipt.sha256 === context.data.source.sha256 &&
        receipt.remotePath.startsWith("gdrive_beta:"),
    )
  if (backup === undefined) return resultErrorCreate(op, "Verified gdrive_beta backup is not available for cleanup")
  const publishJob = input.db
    .select({ status: jobTable.status })
    .from(jobTable)
    .where(and(eq(jobTable.workflowId, job.workflowId), eq(jobTable.kind, "publish_asset")))
    .get()
  if (publishJob?.status !== "succeeded") return resultErrorCreate(op, "Asset publication is not complete for cleanup")
  const catalog = input.db
    .select()
    .from(catalogTable)
    .where(
      and(
        eq(catalogTable.projectId, context.data.asset.projectId),
        eq(catalogTable.environment, context.data.environment.name),
      ),
    )
    .get()
  if (catalog === undefined) return resultErrorCreate(op, "Catalog is not available for cleanup")
  const generation = input.db
    .select()
    .from(catalogGenerationTable)
    .where(eq(catalogGenerationTable.id, catalog.generationId))
    .get()
  if (generation === undefined) return resultErrorCreate(op, "Catalog generation is not available for cleanup")
  const manifest = input.db
    .select()
    .from(manifestTable)
    .where(eq(manifestTable.catalogGenerationId, generation.id))
    .get()
  if (manifest === undefined) return resultErrorCreate(op, "Catalog manifest is not available for cleanup")
  const manifestLocation = storageObjectLocationCreate(context.data.binding, "private-source", manifest.objectKey)
  if (!manifestLocation.success) return manifestLocation
  const verified = await storageObjectVerify(input.storage, {
    location: manifestLocation.data,
    byteSize: manifest.byteSize,
    sha256: manifest.sha256,
    mediaType: "application/json",
  })
  if (!verified.success) return verified

  const parsedPayload = jobPayloadRead(job)
  if (!parsedPayload.success) return parsedPayload
  const configuredWorkspace = parsedPayload.data.values?.workspacePath
  const workspace =
    typeof configuredWorkspace === "string"
      ? configuredWorkspace
      : join(input.temporaryDirectory ?? tmpdir(), `assets-service-${context.data.source.id}`)
  const expectedWorkspace = join(input.temporaryDirectory ?? tmpdir(), `assets-service-${context.data.source.id}`)
  if (workspace !== expectedWorkspace)
    return resultErrorCreate(op, "Cleanup workspace is outside the configured temporary directory")
  try {
    await rm(workspace, { force: true, recursive: true })
    return { success: true, data: null }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}

async function processOutputHandle(
  job: Job,
  handlerContext: Parameters<JobHandler>[1],
  input: AssetWorkflowHandlersRegisterInput,
): Promise<Result<null>> {
  const parsedPayload = jobPayloadRead(job)
  if (!parsedPayload.success || parsedPayload.data.outputDefinitionId === undefined) {
    return resultErrorCreate("processOutputHandle", "Output job is missing its output definition")
  }
  const context = await assetContextRead(input.db, job)
  if (!context.success) return context
  const definition = input.db
    .select()
    .from(outputDefinitionTable)
    .where(eq(outputDefinitionTable.id, parsedPayload.data.outputDefinitionId))
    .get()
  if (definition === undefined) return resultErrorCreate("processOutputHandle", "Output definition not found")
  if (definition.assetId !== context.data.asset.id)
    return resultErrorCreate("processOutputHandle", "Output asset does not match the job")
  if (definition.kind !== context.data.asset.class)
    return resultErrorCreate("processOutputHandle", "Output class does not match the asset class")

  const sourceLocation = sourceLocationCreate(context.data.binding, context.data.source.objectKey)
  if (!sourceLocation.success) return sourceLocation
  const sourceBytes = await input.storage.readObject(sourceLocation.data)
  if (!sourceBytes.success) return sourceBytes
  if (sourceBytes.data === null) return resultErrorCreate("processOutputHandle", "Private source object does not exist")

  const processed = await outputProcess(input, definition, context.data.source, Uint8Array.from(sourceBytes.data))
  if (!processed.success) return processed
  const extension = outputExtensionRead(definition, processed.data.metadata)
  const mediaType = outputMediaTypeRead(definition, processed.data.metadata)
  if (extension === undefined || mediaType === undefined)
    return resultErrorCreate("processOutputHandle", "Output processor returned unsupported media metadata")
  const folders = foldersRead(context.data.asset)
  const allocation = outputVersionRepositoryAllocate(input.db, {
    id: `version-${job.id}`,
    outputDefinitionId: definition.id,
    assetId: context.data.asset.id,
    sourceRevisionId: context.data.source.id,
    byteSize: processed.data.bytes.byteLength,
    sha256: await bytesSha256(processed.data.bytes),
    mediaType,
    extension,
    toolchainVersion: toolchainVersionRead(processed.data.provenance.toolchain),
    width:
      processed.data.metadata.kind === "image" || processed.data.metadata.kind === "video"
        ? processed.data.metadata.width
        : null,
    height:
      processed.data.metadata.kind === "image" || processed.data.metadata.kind === "video"
        ? processed.data.metadata.height
        : null,
    createdAt: input.clock?.().toISOString() ?? new Date().toISOString(),
    current: false,
    forceNewVersion: parsedPayload.data.values?.forceNewVersion === true,
    objectKeyCreate: (version) =>
      outputRemoteObjectKeyCreate({
        assetClass: context.data.asset.class,
        folders,
        basename: context.data.asset.basename,
        outputKey: definition.key,
        version,
        extension,
      }),
  })
  if (!allocation.success) return allocation
  const version = allocation.data.record
  const privateKey = `outputs/${version.id}.${version.extension}`
  const privateLocation = storageObjectLocationCreate(context.data.binding, "private-source", privateKey)
  if (!privateLocation.success) return privateLocation
  const stored = await storageObjectPutEnsure(
    input.storage,
    privateLocation.data,
    processed.data.bytes,
    mediaType,
    version.sha256,
  )
  if (!stored.success) return stored
  const blob = blobRepositoryEnsure(input.db, {
    id: `blob-output-${version.id}`,
    projectId: context.data.asset.projectId,
    assetId: context.data.asset.id,
    sourceRevisionId: context.data.source.id,
    outputVersionId: version.id,
    storage: "private",
    environment: context.data.environment.name,
    kind: "output",
    objectKey: privateKey,
    byteSize: version.byteSize,
    sha256: version.sha256,
    mediaType,
    createdAt: input.clock?.().toISOString() ?? new Date().toISOString(),
  })
  if (!blob.success) return blob

  const payload: JobPayload = {
    ...parsedPayload.data,
    values: {
      ...parsedPayload.data.values,
      outputVersionId: version.id,
      metadata: processed.data.metadata,
      provenance: processed.data.provenance,
    },
  }
  const updated = jobRepositoryPayloadUpdate(input.db, {
    jobId: job.id,
    workerId: handlerContext.workerId,
    payload,
    now: input.clock?.() ?? new Date(),
  })
  if (!updated.success) return updated
  return { success: true, data: null }
}

async function publishAssetHandle(
  job: Job,
  _handlerContext: Parameters<JobHandler>[1],
  input: AssetWorkflowHandlersRegisterInput,
): Promise<Result<null>> {
  const context = await assetContextRead(input.db, job)
  if (!context.success) return context
  const backup = input.db
    .select()
    .from(backupReceiptTable)
    .where(eq(backupReceiptTable.sourceRevisionId, context.data.source.id))
    .all()
    .find(
      (receipt) =>
        receipt.projectId === context.data.asset.projectId &&
        receipt.checkResult === "verified" &&
        receipt.byteSize === context.data.source.byteSize &&
        receipt.sha256 === context.data.source.sha256 &&
        receipt.remotePath.startsWith("gdrive_beta:"),
    )
  if (backup === undefined)
    return resultErrorCreate("publishAssetHandle", "Verified gdrive_beta backup receipt is required")

  const workflowJobs = input.db.select().from(jobTable).where(eq(jobTable.workflowId, job.workflowId)).all()
  if (!workflowJobs.some((candidate) => candidate.kind === "backup_original" && candidate.id === backup.jobId))
    return resultErrorCreate("publishAssetHandle", "Backup receipt does not belong to this workflow")
  const definitions = input.db
    .select()
    .from(outputDefinitionTable)
    .where(eq(outputDefinitionTable.assetId, context.data.asset.id))
    .all()
  const outputs: PublishedOutput[] = []
  for (const processJob of workflowJobs.filter((candidate) => processKinds.has(candidate.kind))) {
    const payload = jobPayloadRead(processJob)
    if (!payload.success || payload.data.outputDefinitionId === undefined || payload.data.values === undefined)
      return resultErrorCreate("publishAssetHandle", "Output job did not persist its result")
    const outputVersionId = payload.data.values.outputVersionId
    const metadata = payload.data.values.metadata
    const parsedVersionId = v.safeParse(v.string(), outputVersionId)
    if (!parsedVersionId.success) return resultErrorCreate("publishAssetHandle", "Output job persisted no version id")
    const parsedMetadata = v.safeParse(v.unknown(), metadata)
    if (!parsedMetadata.success) return resultErrorCreate("publishAssetHandle", "Output job persisted no metadata")
    const definition = input.db
      .select()
      .from(outputDefinitionTable)
      .where(eq(outputDefinitionTable.id, payload.data.outputDefinitionId))
      .get()
    const version = input.db
      .select()
      .from(outputVersionTable)
      .where(eq(outputVersionTable.id, parsedVersionId.output))
      .get()
    if (definition === undefined || version === undefined)
      return resultErrorCreate("publishAssetHandle", "Published output record is missing")
    if (
      definition.assetId !== context.data.asset.id ||
      version.assetId !== context.data.asset.id ||
      version.outputDefinitionId !== definition.id
    )
      return resultErrorCreate("publishAssetHandle", "Published output record belongs to another asset")
    const checkedMetadata = mediaMetadataRead(parsedMetadata.output)
    if (!checkedMetadata.success) return checkedMetadata
    const publicLocation = storageObjectLocationCreate(context.data.binding, "public-output", version.objectKey)
    const privateLocation = storageObjectLocationCreate(
      context.data.binding,
      "private-source",
      `outputs/${version.id}.${version.extension}`,
    )
    if (!publicLocation.success) return publicLocation
    if (!privateLocation.success) return privateLocation
    const privateVerified = await storageObjectVerify(input.storage, {
      location: privateLocation.data,
      byteSize: version.byteSize,
      sha256: version.sha256,
      mediaType: version.mediaType,
    })
    if (!privateVerified.success) return privateVerified
    const publicObject = await storageObjectCopyEnsure(input.storage, privateLocation.data, publicLocation.data, {
      byteSize: version.byteSize,
      sha256: version.sha256,
      mediaType: version.mediaType,
    })
    if (!publicObject.success) return publicObject
    const blob = blobRepositoryEnsure(input.db, {
      id: `blob-public-${version.id}`,
      projectId: context.data.asset.projectId,
      assetId: context.data.asset.id,
      sourceRevisionId: context.data.source.id,
      outputVersionId: version.id,
      storage: "public",
      environment: context.data.environment.name,
      kind: "output",
      objectKey: version.objectKey,
      byteSize: version.byteSize,
      sha256: version.sha256,
      mediaType: version.mediaType,
      createdAt: input.clock?.().toISOString() ?? new Date().toISOString(),
    })
    if (!blob.success) return blob
    outputs.push({ version, definition, metadata: checkedMetadata.data })
  }
  if (outputs.length !== definitions.length)
    return resultErrorCreate("publishAssetHandle", "Not every output definition produced a verified output")
  if (new Set(outputs.map((output) => output.definition.id)).size !== outputs.length)
    return resultErrorCreate("publishAssetHandle", "An output definition was published more than once")

  const published = await catalogPublish(input.db, input.storage, context.data, outputs, input.clock?.() ?? new Date())
  if (!published.success) return published
  const payload = jobPayloadRead(job)
  if (!payload.success) return payload
  if (payload.data.legacyImportId !== undefined) {
    const progress = legacyImportProgressReconcile(input.db, {
      importId: payload.data.legacyImportId,
      currentJobId: job.id,
      now: input.clock?.().toISOString() ?? new Date().toISOString(),
    })
    if (!progress.success) return progress
  }
  return { success: true, data: null }
}

async function assetContextRead(db: AssetDatabase, job: Job): Promise<Result<AssetContext>> {
  const payload = jobPayloadRead(job)
  if (!payload.success) return payload
  if (
    payload.data.assetId === undefined ||
    payload.data.sourceRevisionId === undefined ||
    payload.data.environmentId === undefined
  )
    return resultErrorCreate("assetContextRead", "Job payload is missing asset context")
  const asset = db.select().from(assetTable).where(eq(assetTable.id, payload.data.assetId)).get()
  if (asset === undefined) return resultErrorCreate("assetContextRead", "Asset not found")
  const source = db
    .select()
    .from(sourceRevisionTable)
    .where(eq(sourceRevisionTable.id, payload.data.sourceRevisionId))
    .get()
  if (source === undefined || source.assetId !== asset.id)
    return resultErrorCreate("assetContextRead", "Source revision not found")
  const environment = db
    .select()
    .from(environmentTable)
    .where(eq(environmentTable.id, payload.data.environmentId))
    .get()
  if (environment === undefined) return resultErrorCreate("assetContextRead", "Environment not found")
  const binding = storageBindingResolve(environment, asset.projectId)
  if (!binding.success) return binding
  return { success: true, data: { asset, source, environment, binding: binding.data } }
}

function jobPayloadRead(job: Job): Result<JobPayload> {
  const parsedJob = v.safeParse(jobSchema, job)
  if (!parsedJob.success) return resultErrorCreate("jobPayloadRead", "Persisted job is invalid", parsedJob.issues)
  const parsedPayload = v.safeParse(jobPayloadSchema, parsedJob.output.payload)
  if (!parsedPayload.success)
    return resultErrorCreate("jobPayloadRead", "Persisted job payload is invalid", parsedPayload.issues)
  return { success: true, data: parsedPayload.output }
}

async function outputProcess(
  input: AssetWorkflowHandlersRegisterInput,
  definition: typeof outputDefinitionTable.$inferSelect,
  source: typeof sourceRevisionTable.$inferSelect,
  sourceBytes: Uint8Array,
): Promise<
  Result<{
    bytes: Uint8Array
    metadata: MediaMetadata
    provenance: { schemaVersion: string; toolchain: Array<{ name: string; version: string }> }
  }>
> {
  const processBytes = Uint8Array.from(sourceBytes)
  const processResultCreate = (result: {
    bytes: Uint8Array
    metadata: MediaMetadata
    provenance: { schemaVersion: string; toolchain: Array<{ name: string; version: string }> }
  }): Result<typeof result> => ({ success: true, data: result })
  if (definition.kind === "image") {
    if (input.imageProcessor === undefined) {
      const processed = await imageProcess({
        sourceBytes: processBytes,
        width: definition.width ?? 0,
        height: definition.height ?? 0,
        format: (definition.format ?? undefined) as "jpg" | "png" | "webp" | "avif" | undefined,
        quality: definition.quality ?? undefined,
        ...(definition.showAiLabel === null ? {} : { showAiLabel: definition.showAiLabel }),
      })
      if (!processed.success) return processed
      return processResultCreate({
        bytes: Uint8Array.from(processed.data.bytes),
        metadata: processed.data.metadata,
        provenance: processed.data.provenance,
      })
    }
    const processed = await imageProcess(
      {
        sourceBytes: processBytes,
        width: definition.width ?? 0,
        height: definition.height ?? 0,
        format: (definition.format ?? undefined) as "jpg" | "png" | "webp" | "avif" | undefined,
        quality: definition.quality ?? undefined,
        ...(definition.showAiLabel === null ? {} : { showAiLabel: definition.showAiLabel }),
      },
      input.imageProcessor,
    )
    if (!processed.success) return processed
    return processResultCreate({
      bytes: Uint8Array.from(processed.data.bytes),
      metadata: processed.data.metadata,
      provenance: processed.data.provenance,
    })
  }
  if (definition.kind === "video") {
    const request = { sourceBytes: processBytes, sourceName: source.originalFilename }
    const processed =
      input.videoProcessor === undefined
        ? await videoProcess(request)
        : await videoProcess(request, input.videoProcessor)
    if (!processed.success) return processed
    return processResultCreate({
      bytes: Uint8Array.from(processed.data.bytes),
      metadata: processed.data.metadata,
      provenance: processed.data.provenance,
    })
  }
  if (definition.kind === "document") {
    const mediaType = v.safeParse(documentMediaTypeSchema, source.mediaType)
    if (!mediaType.success) return resultErrorCreate("processOutputHandle", "Document source media type is invalid")
    const processed = documentProcess({
      sourceBytes: processBytes,
      sourceName: source.originalFilename,
      mediaType: mediaType.output,
    })
    if (!processed.success) return processed
    return processResultCreate({
      bytes: Uint8Array.from(processed.data.bytes),
      metadata: processed.data.metadata,
      provenance: processed.data.provenance,
    })
  }
  const outputFormat: "woff2" | undefined = definition.format === "woff2" ? "woff2" : undefined
  const request = {
    sourceBytes: processBytes,
    sourceName: source.originalFilename,
    outputFormat,
  }
  const processed = input.fontProcessor === undefined ? fontProcess(request) : fontProcess(request, input.fontProcessor)
  if (!processed.success) return processed
  return processResultCreate({
    bytes: Uint8Array.from(processed.data.bytes),
    metadata: processed.data.metadata,
    provenance: processed.data.provenance,
  })
}

function outputExtensionRead(
  definition: typeof outputDefinitionTable.$inferSelect,
  metadata: MediaMetadata,
): string | undefined {
  if (definition.kind === "image") return definition.format ?? undefined
  if (definition.kind === "font") return definition.format ?? undefined
  if (definition.kind === "document") return metadata.kind === "document" ? metadata.extension : undefined
  return sourceExtensionRead(metadata)
}

function sourceExtensionRead(metadata: MediaMetadata): string {
  if (metadata.kind === "image") return metadata.format
  if (metadata.kind === "font") return metadata.format
  if (metadata.kind === "document") return metadata.extension
  if (metadata.container === "matroska") return "mkv"
  return metadata.container
}

function outputMediaTypeRead(
  definition: typeof outputDefinitionTable.$inferSelect,
  metadata: MediaMetadata,
): string | undefined {
  if (definition.kind === "image") return definition.format === "jpg" ? "image/jpeg" : `image/${definition.format}`
  if (definition.kind === "font") return `font/${definition.format}`
  if (definition.kind === "document") return metadata.kind === "document" ? metadata.mediaType : undefined
  if (metadata.kind !== "video") return undefined
  if (metadata.container === "matroska" || metadata.container === "webm") return "video/webm"
  return "video/mp4"
}

function toolchainVersionRead(toolchain: Array<{ name: string; version: string }>): string {
  return toolchain.map((tool) => `${tool.name}@${tool.version}`).join(",") || "assets-service.processing.v1"
}

function foldersRead(asset: typeof assetTable.$inferSelect): Folders {
  return [asset.folder1, asset.folder2, asset.folder3].filter((folder): folder is string => folder !== null) as Folders
}

function sourceLocationCreate(
  binding: AssetContext["binding"],
  objectKey: string,
): ReturnType<typeof storageObjectLocationCreate> {
  return storageObjectLocationCreate(binding, "private-source", objectKey)
}

function bytesSha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

function jobDependencyCreate(id: string, jobId: string, dependsOnJobId: string, createdAt: string) {
  return { id, jobId, dependsOnJobId, createdAt }
}

function jobDependencyEnsure(
  db: AssetDatabase,
  dependency: { id: string; jobId: string; dependsOnJobId: string; createdAt: string },
): Result<null> {
  const existing = db
    .select()
    .from(jobDependencyTable)
    .where(
      and(
        eq(jobDependencyTable.jobId, dependency.jobId),
        eq(jobDependencyTable.dependsOnJobId, dependency.dependsOnJobId),
      ),
    )
    .get()
  if (existing !== undefined) return { success: true, data: null }
  const inserted = databaseRecordInsert(db, jobDependencyTable, dependency)
  if (!inserted.success) return inserted
  return { success: true, data: null }
}

async function storageObjectPutEnsure(
  storage: StorageAdapter,
  location: Parameters<StorageAdapter["putImmutable"]>[0]["location"],
  bytes: Uint8Array,
  mediaType: string,
  sha256: string,
): Promise<Result<StorageObject>> {
  const existing = await storageObjectVerify(storage, { location, byteSize: bytes.byteLength, sha256, mediaType })
  if (existing.success) {
    const head = await storage.headObject(location)
    if (!head.success) return head
    if (head.data !== null) return { success: true, data: head.data }
    return resultErrorCreate("storageObjectPutEnsure", "Stored object disappeared")
  }
  const stored = await storagePutImmutable(storage, { location, bytes, mediaType, sha256 })
  if (stored.success) {
    if (stored.data.byteSize === bytes.byteLength && stored.data.sha256 === sha256) return stored
    const verified = await storageObjectVerify(storage, { location, byteSize: bytes.byteLength, sha256, mediaType })
    if (!verified.success) return stored
    return stored
  }
  const raced = await storageObjectVerify(storage, { location, byteSize: bytes.byteLength, sha256, mediaType })
  if (raced.success) {
    const head = await storage.headObject(location)
    if (!head.success) return head
    if (head.data !== null) return { success: true, data: head.data }
    return resultErrorCreate("storageObjectPutEnsure", "Stored object disappeared")
  }
  return stored
}

async function storageObjectCopyEnsure(
  storage: StorageAdapter,
  source: Parameters<StorageAdapter["copyImmutable"]>[0]["source"],
  destination: Parameters<StorageAdapter["copyImmutable"]>[0]["destination"],
  expected: { byteSize: number; sha256: string; mediaType: string },
): Promise<Result<StorageObject>> {
  const existing = await storageObjectVerify(storage, { location: destination, ...expected })
  if (existing.success) {
    const head = await storage.headObject(destination)
    if (!head.success) return head
    if (head.data !== null) return { success: true, data: head.data }
    return resultErrorCreate("storageObjectCopyEnsure", "Copied object disappeared")
  }
  const copied = await storageCopyImmutable(storage, {
    source,
    destination,
    mediaType: expected.mediaType,
    sha256: expected.sha256,
  })
  if (copied.success) {
    const verified = await storageObjectVerify(storage, { location: destination, ...expected })
    if (!verified.success) return verified
    return copied
  }
  const raced = await storageObjectVerify(storage, { location: destination, ...expected })
  if (raced.success) {
    const head = await storage.headObject(destination)
    if (!head.success) return head
    if (head.data !== null) return { success: true, data: head.data }
    return resultErrorCreate("storageObjectCopyEnsure", "Copied object disappeared")
  }
  return copied
}

function blobRepositoryEnsure(
  db: AssetDatabase,
  blob: typeof blobTable.$inferInsert,
): Result<typeof blobTable.$inferSelect> {
  const existing = db.select().from(blobTable).where(eq(blobTable.id, blob.id)).get()
  if (existing !== undefined) {
    if (existing.sha256 !== blob.sha256 || existing.byteSize !== blob.byteSize || existing.objectKey !== blob.objectKey)
      return resultErrorCreate("blobRepositoryEnsure", "Blob identity does not match the immutable object")
    return { success: true, data: existing }
  }
  return databaseRecordInsert(db, blobTable, blob)
}

async function catalogPublish(
  db: AssetDatabase,
  storage: StorageAdapter,
  context: AssetContext,
  outputs: readonly PublishedOutput[],
  now: Date,
): Promise<Result<null>> {
  const currentCatalog = db
    .select()
    .from(catalogTable)
    .where(
      and(eq(catalogTable.projectId, context.asset.projectId), eq(catalogTable.environment, context.environment.name)),
    )
    .get()
  const previousOutputs =
    currentCatalog === undefined
      ? []
      : db
          .select()
          .from(catalogOutputTable)
          .where(eq(catalogOutputTable.generationId, currentCatalog.generationId))
          .all()
  const proposedGenerationId = `catalog-generation-${context.asset.id}-${context.source.id}`
  const nextOutputs = [
    ...previousOutputs
      .filter((output) => output.assetId !== context.asset.id)
      .map((output) => ({ ...output, generationId: proposedGenerationId })),
    ...outputs.map((output) => ({
      generationId: proposedGenerationId,
      assetId: context.asset.id,
      outputVersionId: output.version.id,
      class: context.asset.class,
      key: output.definition.key,
      property: catalogEntryPropertyCreate({
        folders: foldersRead(context.asset),
        basename: context.asset.basename,
        key: output.definition.key,
      }),
      path: output.version.objectKey,
      metadata: output.metadata,
    })),
  ]
  const canonicalOutputsForDigest = nextOutputs.toSorted((left, right) => {
    if (left.property !== right.property) return left.property < right.property ? -1 : 1
    return left.outputVersionId < right.outputVersionId ? -1 : left.outputVersionId > right.outputVersionId ? 1 : 0
  })
  const manifestOutputs = canonicalOutputsForDigest.map(({ generationId: _generationId, ...output }) => output)
  const digest = canonicalJsonDigest(manifestOutputs)
  const existingGeneration = db
    .select()
    .from(catalogGenerationTable)
    .where(
      and(
        eq(catalogGenerationTable.projectId, context.asset.projectId),
        eq(catalogGenerationTable.environment, context.environment.name),
        eq(catalogGenerationTable.digest, digest),
      ),
    )
    .get()
  const generationId = existingGeneration?.id ?? proposedGenerationId
  const canonicalOutputs = canonicalOutputsForDigest.map((output) => ({ ...output, generationId }))
  const generatedAt = existingGeneration?.createdAt ?? now.toISOString()
  const manifestObjectKey =
    existingGeneration?.manifestObjectKey ?? `catalogs/${context.environment.name}/${digest}.json`
  const parsedManifest = v.safeParse(catalogSchema, {
    schema: "assets.catalog.v1",
    projectId: context.asset.projectId,
    environment: context.environment.name,
    digest,
    rendererVersion: "assets-service.catalog.v1",
    generatedAt,
    outputs: manifestOutputs,
  })
  if (!parsedManifest.success)
    return resultErrorCreate("catalogPublish", "Canonical catalog manifest is invalid", parsedManifest.issues)
  const manifestBytes = new TextEncoder().encode(canonicalJsonStringify(parsedManifest.output))
  const manifestSha256 = bytesSha256(manifestBytes)
  const manifestLocation = storageObjectLocationCreate(context.binding, "private-source", manifestObjectKey)
  if (!manifestLocation.success) return manifestLocation
  const storedManifest = await storageObjectPutEnsure(
    storage,
    manifestLocation.data,
    manifestBytes,
    "application/json",
    manifestSha256,
  )
  if (!storedManifest.success) return storedManifest

  return databaseTransactionRun<null>(
    db,
    (transaction) => {
      const currentVersions = transaction
        .select({ id: outputVersionTable.id, outputDefinitionId: outputVersionTable.outputDefinitionId })
        .from(outputVersionTable)
        .where(eq(outputVersionTable.assetId, context.asset.id))
        .all()
      for (const version of currentVersions) {
        transaction
          .update(outputVersionTable)
          .set({ current: false })
          .where(eq(outputVersionTable.id, version.id))
          .run()
      }
      for (const output of outputs) {
        transaction
          .update(outputVersionTable)
          .set({ current: true })
          .where(eq(outputVersionTable.id, output.version.id))
          .run()
      }

      const generation = transaction
        .select()
        .from(catalogGenerationTable)
        .where(eq(catalogGenerationTable.id, generationId))
        .get()
      if (generation === undefined) {
        const insertedGeneration = databaseRecordInsert(transaction, catalogGenerationTable, {
          id: generationId,
          projectId: context.asset.projectId,
          environment: context.environment.name,
          digest,
          manifestObjectKey,
          rendererVersion: "assets-service.catalog.v1",
          createdAt: generatedAt,
        })
        if (!insertedGeneration.success) return insertedGeneration
      } else if (
        generation.projectId !== context.asset.projectId ||
        generation.environment !== context.environment.name ||
        generation.digest !== digest ||
        generation.manifestObjectKey !== manifestObjectKey
      ) {
        return resultErrorCreate("catalogPublish", "Catalog generation identity does not match its manifest")
      }

      const manifest = transaction
        .select()
        .from(manifestTable)
        .where(eq(manifestTable.catalogGenerationId, generationId))
        .get()
      if (manifest === undefined) {
        const insertedManifest = databaseRecordInsert(transaction, manifestTable, {
          id: `manifest-${generationId}`,
          projectId: context.asset.projectId,
          assetId: null,
          catalogGenerationId: generationId,
          kind: "catalog",
          schema: "assets.catalog.v1",
          objectKey: manifestObjectKey,
          byteSize: manifestBytes.byteLength,
          sha256: manifestSha256,
          createdAt: generatedAt,
        })
        if (!insertedManifest.success) return insertedManifest
      } else if (
        manifest.projectId !== context.asset.projectId ||
        manifest.kind !== "catalog" ||
        manifest.schema !== "assets.catalog.v1" ||
        manifest.objectKey !== manifestObjectKey ||
        manifest.byteSize !== manifestBytes.byteLength ||
        manifest.sha256 !== manifestSha256
      ) {
        return resultErrorCreate("catalogPublish", "Catalog manifest identity does not match its immutable object")
      }
      const manifestBlob = blobRepositoryEnsure(transaction, {
        id: `blob-manifest-${generationId}`,
        projectId: context.asset.projectId,
        assetId: null,
        sourceRevisionId: null,
        outputVersionId: null,
        storage: "private",
        environment: context.environment.name,
        kind: "manifest",
        objectKey: manifestObjectKey,
        byteSize: manifestBytes.byteLength,
        sha256: manifestSha256,
        mediaType: "application/json",
        createdAt: generatedAt,
      })
      if (!manifestBlob.success) return manifestBlob
      transaction.delete(catalogOutputTable).where(eq(catalogOutputTable.generationId, generationId)).run()
      for (const output of canonicalOutputs) {
        const insertedOutput = databaseRecordInsert(transaction, catalogOutputTable, output)
        if (!insertedOutput.success) return insertedOutput
      }

      const catalog = transaction
        .select()
        .from(catalogTable)
        .where(eq(catalogTable.id, `catalog-${context.asset.projectId}-${context.environment.name}`))
        .get()
      if (catalog === undefined) {
        const insertedCatalog = databaseRecordInsert(transaction, catalogTable, {
          id: `catalog-${context.asset.projectId}-${context.environment.name}`,
          projectId: context.asset.projectId,
          environment: context.environment.name,
          generationId,
          schema: "assets.catalog.v1",
          digest,
          rendererVersion: "assets-service.catalog.v1",
          generatedAt,
          updatedAt: generatedAt,
        })
        if (!insertedCatalog.success) return insertedCatalog
      } else {
        const updatedCatalog = transaction
          .update(catalogTable)
          .set({ generationId, digest, generatedAt, updatedAt: generatedAt })
          .where(eq(catalogTable.id, catalog.id))
          .returning({ id: catalogTable.id })
          .get()
        if (updatedCatalog === undefined)
          return resultErrorCreate("catalogPublish", "Catalog pointer changed concurrently")
      }
      return { success: true, data: null }
    },
    { behavior: "immediate" },
  )
}

function mediaMetadataRead(value: unknown): Result<MediaMetadata> {
  const parsed = v.safeParse(mediaMetadataSchema, value)
  if (!parsed.success) return resultErrorCreate("mediaMetadataRead", "Output metadata is invalid", parsed.issues)
  return { success: true, data: parsed.output }
}
