import { and, asc, eq } from "drizzle-orm"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as v from "valibot"
import { assetBasenameCreate } from "../asset/assetBasenameCreate.js"
import { assetFilenameSchema } from "../asset/assetFilenameSchema.js"
import { foldersDatabaseColumnsCreate } from "../asset/foldersDatabaseColumnsCreate.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { blobTable } from "../infrastructure/db/schema/blobTable.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { jobDependencyTable } from "../infrastructure/db/schema/jobDependencyTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { outputDefinitionTable } from "../infrastructure/db/schema/outputDefinitionTable.js"
import { sourceRevisionTable } from "../infrastructure/db/schema/sourceRevisionTable.js"
import { uploadTable } from "../infrastructure/db/schema/uploadTable.js"
import { workflowTable } from "../infrastructure/db/schema/workflowTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import { storageBindingResolve } from "../storage/storageBindingResolve.js"
import { storageCopyImmutable } from "../storage/storageCopyImmutable.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import type { StorageObject } from "../storage/storageObjectSchema.js"
import { storageObjectVerify } from "../storage/storageObjectVerify.js"
import { storageStagingObjectKeyCreate } from "../storage/storageStagingObjectKeyCreate.js"
import { workflowJobCreate } from "../workflow/workflowJobCreate.js"
import { workflowJobIdCreate } from "../workflow/workflowJobIdCreate.js"

type UploadIngestionCompleteInput = {
  uploadId: string
  outputDefinitions?: readonly (typeof outputDefinitionTable.$inferInsert)[]
  now?: Date | string
  retryLimit?: number
  temporaryDirectory?: string
}

type UploadIngestionCompleteResult = {
  uploadId: string
  assetId: string
  sourceRevisionId: string
  workflowId: string
}

const isoDateCreate = (value: Date | string | undefined): string =>
  value instanceof Date ? value.toISOString() : (value ?? new Date().toISOString())

export const uploadIngestionComplete = async (
  db: AssetDatabase,
  storage: StorageAdapter,
  input: UploadIngestionCompleteInput,
): Promise<Result<UploadIngestionCompleteResult>> => {
  const op = "uploadIngestionComplete"
  const now = isoDateCreate(input.now)
  const upload = db.select().from(uploadTable).where(eq(uploadTable.id, input.uploadId)).get()
  if (upload === undefined) return resultErrorCreate(op, `Upload not found: ${input.uploadId}`)

  if (upload.status === "accepted" && upload.assetId !== null && upload.sourceRevisionId !== null) {
    const acceptedAssetId = upload.assetId
    const acceptedSourceRevisionId = upload.sourceRevisionId
    const retryLimit = input.retryLimit ?? 3
    if (!Number.isInteger(retryLimit) || retryLimit < 0) return resultErrorCreate(op, "Retry limit is invalid")
    const ensured = databaseTransactionRun<UploadIngestionCompleteResult>(
      db,
      (transaction) => {
        const environment = transaction
          .select()
          .from(environmentTable)
          .where(eq(environmentTable.id, upload.environmentId))
          .get()
        if (environment === undefined) return resultErrorCreate(op, `Environment not found: ${upload.environmentId}`)
        const workflow = transaction
          .select()
          .from(workflowTable)
          .where(eq(workflowTable.id, `workflow-upload-${upload.id}`))
          .get()
        if (workflow === undefined) return resultErrorCreate(op, `Workflow not found: workflow-upload-${upload.id}`)
        const jobs = workflowJobsEnsure(transaction, {
          workflowId: workflow.id,
          assetId: acceptedAssetId,
          sourceRevisionId: acceptedSourceRevisionId,
          uploadId: upload.id,
          environmentId: environment.id,
          retryLimit,
          now,
          temporaryDirectory: input.temporaryDirectory,
        })
        if (!jobs.success) return jobs
        return {
          success: true,
          data: {
            uploadId: upload.id,
            assetId: acceptedAssetId,
            sourceRevisionId: acceptedSourceRevisionId,
            workflowId: workflow.id,
          },
        }
      },
      { behavior: "immediate" },
    )
    return ensured
  }
  if (upload.status === "cancelled") return resultErrorCreate(op, "Upload is cancelled")
  if (upload.stagingObjectKey === null) return resultErrorCreate(op, "Upload has no staged object")
  if (upload.mediaType === null || upload.sha256 === null)
    return resultErrorCreate(op, "Upload must include expected media type and checksum")

  const environment = db.select().from(environmentTable).where(eq(environmentTable.id, upload.environmentId)).get()
  if (environment === undefined) return resultErrorCreate(op, `Environment not found: ${upload.environmentId}`)
  const binding = storageBindingResolve(environment, upload.projectId)
  if (!binding.success) return binding

  const filename = v.safeParse(assetFilenameSchema, upload.originalFilename)
  if (!filename.success) return resultErrorCreate(op, "Upload filename is invalid", filename.issues)
  const folders = v.safeParse(
    foldersSchema,
    [upload.folder1, upload.folder2, upload.folder3].filter((value) => value !== null),
  )
  if (!folders.success) return resultErrorCreate(op, "Upload folders are invalid", folders.issues)
  const columns = foldersDatabaseColumnsCreate(folders.output)
  if (!columns.success) return columns

  const stagingLocation = storageStagingObjectKeyCreate(binding.data, upload.id)
  if (!stagingLocation.success) return stagingLocation
  if (stagingLocation.data.objectKey !== upload.stagingObjectKey)
    return resultErrorCreate(op, "Upload staging object key does not match its upload id")

  const verification = await storageObjectVerify(storage, {
    location: stagingLocation.data,
    byteSize: upload.byteSize,
    sha256: upload.sha256,
    mediaType: upload.mediaType,
  })
  if (!verification.success) return verification

  const assetClass = assetClassFromMediaType(verification.data.mediaType)
  if (assetClass === undefined) return resultErrorCreate(op, "Uploaded media type is not a supported asset class")

  const sourceRevisionId = `source-${upload.id}`
  const sourceObjectKey = `sources/${sourceRevisionId}/${filename.output}`
  const sourceLocation = storageObjectLocationCreate(binding.data, "private-source", sourceObjectKey)
  if (!sourceLocation.success) return sourceLocation
  const copied = await storageObjectCopyEnsure(storage, stagingLocation.data, sourceLocation.data, {
    mediaType: verification.data.mediaType,
    sha256: verification.data.sha256,
    byteSize: verification.data.byteSize,
  })
  if (!copied.success) return copied

  return databaseTransactionRun<UploadIngestionCompleteResult>(
    db,
    (transaction) => {
      const currentUpload = transaction.select().from(uploadTable).where(eq(uploadTable.id, upload.id)).get()
      if (currentUpload === undefined) return resultErrorCreate(op, `Upload not found: ${upload.id}`)
      if (
        currentUpload.status === "accepted" &&
        currentUpload.assetId !== null &&
        currentUpload.sourceRevisionId !== null
      ) {
        return {
          success: true,
          data: {
            uploadId: currentUpload.id,
            assetId: currentUpload.assetId,
            sourceRevisionId: currentUpload.sourceRevisionId,
            workflowId: `workflow-upload-${currentUpload.id}`,
          },
        }
      }

      const existingAsset = currentUpload.assetId
        ? transaction.select().from(assetTable).where(eq(assetTable.id, currentUpload.assetId)).get()
        : transaction
            .select()
            .from(assetTable)
            .where(
              and(
                eq(assetTable.projectId, currentUpload.projectId),
                eq(assetTable.class, assetClass),
                eq(assetTable.basename, assetBasenameCreate(filename.output)),
              ),
            )
            .all()
            .find(
              (candidate) =>
                candidate.folder1 === columns.data.folder1 &&
                candidate.folder2 === columns.data.folder2 &&
                candidate.folder3 === columns.data.folder3,
            )
      if (existingAsset !== undefined && existingAsset.class !== assetClass)
        return resultErrorCreate(op, "Upload asset class does not match the existing asset")

      const assetId = existingAsset?.id ?? `asset-${upload.id}`
      const sourceRevision = transaction
        .select()
        .from(sourceRevisionTable)
        .where(eq(sourceRevisionTable.id, sourceRevisionId))
        .get()
      const highestRevision = transaction
        .select({ revision: sourceRevisionTable.revision })
        .from(sourceRevisionTable)
        .where(eq(sourceRevisionTable.assetId, assetId))
        .orderBy(asc(sourceRevisionTable.revision))
        .all()
        .reduce((highest, current) => Math.max(highest, current.revision), 0)
      const revision = sourceRevision?.revision ?? highestRevision + 1

      if (existingAsset === undefined) {
        const insertedAsset = databaseRecordInsert(transaction, assetTable, {
          id: assetId,
          projectId: currentUpload.projectId,
          class: assetClass,
          ...columns.data,
          filename: filename.output,
          basename: assetBasenameCreate(filename.output),
          currentSourceRevisionId: sourceRevisionId,
          integrationNote: currentUpload.integrationNote,
          createdAt: now,
          updatedAt: now,
        })
        if (!insertedAsset.success) return insertedAsset
      } else {
        const updatedAsset = transaction
          .update(assetTable)
          .set({ currentSourceRevisionId: sourceRevisionId, updatedAt: now })
          .where(eq(assetTable.id, existingAsset.id))
          .returning()
          .get()
        if (updatedAsset === undefined) return resultErrorCreate(op, "Asset disappeared during ingestion")
      }

      if (sourceRevision === undefined) {
        const insertedSource = databaseRecordInsert(transaction, sourceRevisionTable, {
          id: sourceRevisionId,
          assetId,
          revision,
          class: assetClass,
          originalFilename: filename.output,
          mediaType: verification.data.mediaType,
          byteSize: verification.data.byteSize,
          sha256: verification.data.sha256,
          objectKey: sourceObjectKey,
          createdAt: now,
        })
        if (!insertedSource.success) return insertedSource
      } else if (
        sourceRevision.assetId !== assetId ||
        sourceRevision.sha256 !== verification.data.sha256 ||
        sourceRevision.byteSize !== verification.data.byteSize
      ) {
        return resultErrorCreate(op, "Upload source revision identity does not match the staged object")
      }

      const existingBlob = transaction
        .select()
        .from(blobTable)
        .where(and(eq(blobTable.storage, "private"), eq(blobTable.objectKey, sourceObjectKey)))
        .get()
      if (existingBlob === undefined) {
        const insertedBlob = databaseRecordInsert(transaction, blobTable, {
          id: `blob-source-${sourceRevisionId}`,
          projectId: currentUpload.projectId,
          assetId,
          sourceRevisionId,
          outputVersionId: null,
          storage: "private",
          environment: environment.name,
          kind: "source",
          objectKey: sourceObjectKey,
          byteSize: verification.data.byteSize,
          sha256: verification.data.sha256,
          mediaType: verification.data.mediaType,
          createdAt: now,
        })
        if (!insertedBlob.success) return insertedBlob
      }

      const outputDefinitions = input.outputDefinitions ?? []
      for (const definition of outputDefinitions) {
        if (definition.assetId !== assetId)
          return resultErrorCreate(op, `Output belongs to another asset: ${definition.id}`)
        const existingDefinition = transaction
          .select()
          .from(outputDefinitionTable)
          .where(eq(outputDefinitionTable.id, definition.id))
          .get()
        if (existingDefinition !== undefined) continue
        const insertedDefinition = databaseRecordInsert(transaction, outputDefinitionTable, {
          ...definition,
          assetId,
          createdAt: definition.createdAt ?? now,
          updatedAt: definition.updatedAt ?? now,
        })
        if (!insertedDefinition.success) return insertedDefinition
      }

      const workflowId = `workflow-upload-${upload.id}`
      const existingWorkflow = transaction.select().from(workflowTable).where(eq(workflowTable.id, workflowId)).get()
      if (existingWorkflow !== undefined) {
        const retryLimit = input.retryLimit ?? 3
        if (!Number.isInteger(retryLimit) || retryLimit < 0) return resultErrorCreate(op, "Retry limit is invalid")
        const jobs = workflowJobsEnsure(transaction, {
          workflowId,
          assetId,
          sourceRevisionId,
          uploadId: upload.id,
          environmentId: environment.id,
          retryLimit,
          now,
          temporaryDirectory: input.temporaryDirectory,
        })
        if (!jobs.success) return jobs
        return { success: true, data: { uploadId: upload.id, assetId, sourceRevisionId, workflowId } }
      }

      const workflow = databaseRecordInsert(transaction, workflowTable, {
        id: workflowId,
        projectId: currentUpload.projectId,
        assetId,
        kind: "asset_processing",
        status: "queued",
        createdAt: now,
        updatedAt: now,
      })
      if (!workflow.success) return workflow

      const retryLimit = input.retryLimit ?? 3
      if (!Number.isInteger(retryLimit) || retryLimit < 0) return resultErrorCreate(op, "Retry limit is invalid")
      const jobs = workflowJobsEnsure(transaction, {
        workflowId,
        assetId,
        sourceRevisionId,
        uploadId: upload.id,
        environmentId: environment.id,
        retryLimit,
        now,
        temporaryDirectory: input.temporaryDirectory,
      })
      if (!jobs.success) return jobs

      const updatedUpload = transaction
        .update(uploadTable)
        .set({
          assetId,
          sourceRevisionId,
          mediaType: verification.data.mediaType,
          sha256: verification.data.sha256,
          status: "accepted",
          failureReason: null,
          verifiedAt: now,
          updatedAt: now,
        })
        .where(eq(uploadTable.id, upload.id))
        .returning({ id: uploadTable.id })
        .get()
      if (updatedUpload === undefined) return resultErrorCreate(op, "Upload disappeared during ingestion")

      return { success: true, data: { uploadId: upload.id, assetId, sourceRevisionId, workflowId } }
    },
    { behavior: "immediate" },
  )
}

function workflowJobsEnsure(
  db: AssetDatabase,
  input: {
    workflowId: string
    assetId: string
    sourceRevisionId: string
    uploadId: string
    environmentId: string
    retryLimit: number
    now: string
    temporaryDirectory?: string
  },
): Result<null> {
  const definitions = db
    .select()
    .from(outputDefinitionTable)
    .where(eq(outputDefinitionTable.assetId, input.assetId))
    .orderBy(asc(outputDefinitionTable.key))
    .all()
  const context = {
    assetId: input.assetId,
    sourceRevisionId: input.sourceRevisionId,
    uploadId: input.uploadId,
    environmentId: input.environmentId,
  }
  const workspacePath = join(input.temporaryDirectory ?? tmpdir(), `assets-service-${input.sourceRevisionId}`)
  const verifyJob = workflowJobCreate({
    id: `${input.workflowId}-verify`,
    workflowId: input.workflowId,
    kind: "verify_original",
    payload: context,
    now: input.now,
    retryLimit: input.retryLimit,
  })
  const backupJob = workflowJobCreate({
    id: `${input.workflowId}-backup`,
    workflowId: input.workflowId,
    kind: "backup_original",
    payload: context,
    now: input.now,
    retryLimit: input.retryLimit,
  })
  const planJob = workflowJobCreate({
    id: `${input.workflowId}-plan`,
    workflowId: input.workflowId,
    kind: "plan_outputs",
    payload: context,
    now: input.now,
    retryLimit: input.retryLimit,
  })
  const outputJobs = definitions.map((definition) =>
    workflowJobCreate({
      id: workflowJobIdCreate(input.workflowId, `output-${definition.id}`),
      workflowId: input.workflowId,
      kind:
        definition.kind === "image"
          ? "process_image_output"
          : definition.kind === "video"
            ? "copy_video_output"
            : "process_font_output",
      payload: { ...context, outputDefinitionId: definition.id },
      now: input.now,
      retryLimit: input.retryLimit,
    }),
  )
  const publishJob = workflowJobCreate({
    id: `${input.workflowId}-publish`,
    workflowId: input.workflowId,
    kind: "publish_asset",
    payload: context,
    now: input.now,
    retryLimit: input.retryLimit,
  })
  const notifyJob = workflowJobCreate({
    id: `${input.workflowId}-notify`,
    workflowId: input.workflowId,
    kind: "notify_customer_upload",
    payload: context,
    now: input.now,
    retryLimit: input.retryLimit,
  })
  const cleanupJob = workflowJobCreate({
    id: `${input.workflowId}-cleanup`,
    workflowId: input.workflowId,
    kind: "cleanup_local_files",
    payload: { ...context, values: { workspacePath } },
    now: input.now,
    retryLimit: input.retryLimit,
  })
  const jobs = [verifyJob, backupJob, planJob, ...outputJobs, publishJob, notifyJob, cleanupJob]
  let insertedAny = false
  for (const job of jobs) {
    const existing = db.select().from(jobTable).where(eq(jobTable.id, job.id)).get()
    if (existing !== undefined) {
      if (existing.workflowId !== input.workflowId || existing.kind !== job.kind)
        return resultErrorCreate("workflowJobsEnsure", `Job identity does not match: ${job.id}`)
      continue
    }
    const inserted = databaseRecordInsert(db, jobTable, job)
    if (!inserted.success) return inserted
    insertedAny = true
  }

  const dependencies = [
    dependencyCreate(`${input.workflowId}-dependency-backup`, backupJob.id, verifyJob.id, input.now),
    dependencyCreate(`${input.workflowId}-dependency-plan`, planJob.id, backupJob.id, input.now),
    dependencyCreate(`${input.workflowId}-dependency-publish-plan`, publishJob.id, planJob.id, input.now),
    ...outputJobs.map((job) =>
      dependencyCreate(workflowJobIdCreate(job.id, "dependency-plan"), job.id, planJob.id, input.now),
    ),
    ...outputJobs.map((job) =>
      dependencyCreate(workflowJobIdCreate(publishJob.id, `dependency-${job.id}`), publishJob.id, job.id, input.now),
    ),
    // Notification eligibility is decided when the upload is accepted. It must not
    // wait for publication, because Telegram failure or a processing retry cannot
    // change the accepted-upload decision.
    dependencyCreate(`${cleanupJob.id}-dependency-publish`, cleanupJob.id, publishJob.id, input.now),
  ]
  for (const dependency of dependencies) {
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
    if (existing !== undefined) continue
    const inserted = databaseRecordInsert(db, jobDependencyTable, dependency)
    if (!inserted.success) return inserted
    insertedAny = true
  }

  if (insertedAny) {
    db.update(workflowTable)
      .set({ status: "queued", updatedAt: input.now })
      .where(and(eq(workflowTable.id, input.workflowId), eq(workflowTable.status, "succeeded")))
      .run()
  }
  return { success: true, data: null }
}

function dependencyCreate(id: string, jobId: string, dependsOnJobId: string, createdAt: string) {
  return { id, jobId, dependsOnJobId, createdAt }
}

function assetClassFromMediaType(mediaType: string): "image" | "video" | "font" | undefined {
  if (mediaType.startsWith("image/")) return "image"
  if (mediaType.startsWith("video/")) return "video"
  if (mediaType.startsWith("font/")) return "font"
  return undefined
}

async function storageObjectCopyEnsure(
  storage: StorageAdapter,
  source: Parameters<StorageAdapter["copyImmutable"]>[0]["source"],
  destination: Parameters<StorageAdapter["copyImmutable"]>[0]["destination"],
  expected: { byteSize: number; sha256: string; mediaType: string },
): Promise<Result<StorageObject>> {
  const existing = await storageObjectVerify(storage, {
    location: destination,
    byteSize: expected.byteSize,
    sha256: expected.sha256,
    mediaType: expected.mediaType,
  })
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
    const verified = await storageObjectVerify(storage, {
      location: destination,
      byteSize: expected.byteSize,
      sha256: expected.sha256,
      mediaType: expected.mediaType,
    })
    if (!verified.success) return verified
    return copied
  }
  const raced = await storageObjectVerify(storage, {
    location: destination,
    byteSize: expected.byteSize,
    sha256: expected.sha256,
    mediaType: expected.mediaType,
  })
  if (raced.success) {
    const head = await storage.headObject(destination)
    if (!head.success) return head
    if (head.data !== null) return { success: true, data: head.data }
    return resultErrorCreate("storageObjectCopyEnsure", "Copied object disappeared")
  }
  return copied
}
