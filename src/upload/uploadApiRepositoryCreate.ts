import { and, asc, eq } from "drizzle-orm"
import * as v from "valibot"

import type { UploadCompletionRequest } from "../api-client/uploadCompletionRequestSchema.js"
import { uploadCompletionRequestSchema } from "../api-client/uploadCompletionRequestSchema.js"
import type { UploadIntentRequest } from "../api-client/uploadIntentRequestSchema.js"
import { uploadIntentRequestSchema } from "../api-client/uploadIntentRequestSchema.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { uploadTable } from "../infrastructure/db/schema/uploadTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import { storageBindingResolve } from "../storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import { storageStagingObjectKeyCreate } from "../storage/storageStagingObjectKeyCreate.js"
import { storageUploadIntentComplete } from "../storage/storageUploadIntentComplete.js"
import { storageUploadIntentCreate } from "../storage/storageUploadIntentCreate.js"
import { uploadIngestionComplete } from "./uploadIngestionComplete.js"
import { uploadMediaTypeCheck } from "./uploadMediaTypeCheck.js"
import type { UploadApiRepository } from "./uploadApiRepository.js"
import { foldersDatabaseColumnsRead } from "../asset/foldersDatabaseColumnsRead.js"
import { uploadSchema } from "./uploadSchema.js"

type UploadApiRepositoryCreateOptions = {
  now?: () => Date
}

export const uploadApiRepositoryCreate = (
  db: AssetDatabase,
  storage: StorageAdapter,
  options: UploadApiRepositoryCreateOptions = {},
): UploadApiRepository => {
  const nowRead = options.now ?? (() => new Date())

  const uploadRead = (record: typeof uploadTable.$inferSelect): Result<import("./uploadSchema.js").Upload> => {
    const folders = foldersDatabaseColumnsRead({
      folder1: record.folder1,
      folder2: record.folder2,
      folder3: record.folder3,
    })
    if (!folders.success) return folders
    const parsed = v.safeParse(uploadSchema, {
      id: record.id,
      projectId: record.projectId,
      environmentId: record.environmentId,
      ...(record.assetId === null ? {} : { assetId: record.assetId }),
      ...(record.sourceRevisionId === null ? {} : { sourceRevisionId: record.sourceRevisionId }),
      ...(record.uploaderId === null ? {} : { uploaderId: record.uploaderId }),
      originalFilename: record.originalFilename,
      folders: folders.data,
      integrationNote: record.integrationNote,
      byteSize: record.byteSize,
      ...(record.mediaType === null ? {} : { mediaType: record.mediaType }),
      ...(record.sha256 === null ? {} : { sha256: record.sha256 }),
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })
    if (!parsed.success) return resultErrorCreate("uploadApiRepositoryUploadRead", "The stored upload was invalid")
    return { success: true, data: parsed.output }
  }

  const uploadsRead: NonNullable<UploadApiRepository["uploadsRead"]> = (projectId, input) => {
    try {
      const records = db
        .select()
        .from(uploadTable)
        .where(
          and(
            eq(uploadTable.projectId, projectId),
            ...(input.status === undefined ? [] : [eq(uploadTable.status, input.status)]),
            ...(input.assetId === undefined ? [] : [eq(uploadTable.assetId, input.assetId)]),
          ),
        )
        .orderBy(asc(uploadTable.createdAt), asc(uploadTable.id))
        .all()
      const offset = input.cursor ?? 0
      const limit = Math.min(100, Math.max(1, input.limit ?? 50))
      const selected = records.slice(offset, offset + limit + 1)
      const items: import("./uploadSchema.js").Upload[] = []
      for (const record of selected.slice(0, limit)) {
        const upload = uploadRead(record)
        if (!upload.success) return upload
        items.push(upload.data)
      }
      return { success: true, data: { items, nextCursor: selected.length > limit ? offset + limit : null } }
    } catch (error) {
      return resultErrorCreate("uploadApiRepositoryUploadsRead", "The uploads could not be read", error)
    }
  }

  const uploadReadById: NonNullable<UploadApiRepository["uploadRead"]> = (projectId, uploadId) => {
    try {
      const record = db
        .select()
        .from(uploadTable)
        .where(and(eq(uploadTable.projectId, projectId), eq(uploadTable.id, uploadId)))
        .get()
      if (record === undefined) return { success: true, data: null }
      return uploadRead(record)
    } catch (error) {
      return resultErrorCreate("uploadApiRepositoryUploadRead", "The upload could not be read", error)
    }
  }

  const uploadIntentCreate = async (
    projectId: string,
    environment: Parameters<UploadApiRepository["uploadIntentCreate"]>[1],
    input: UploadIntentRequest,
    uploaderId?: string,
  ): Promise<Result<import("../api-client/uploadIntentResponseSchema.js").UploadIntentResponse>> => {
    const op = "uploadApiRepositoryIntentCreate"
    const parsed = v.safeParse(uploadIntentRequestSchema, input)
    if (!parsed.success) return resultErrorCreate(op, "The upload intent was invalid", parsed.issues)
    const mediaType = uploadMediaTypeCheck(parsed.output.mediaType)
    if (!mediaType.success) return mediaType
    if (environment.projectId !== projectId)
      return resultErrorCreate(op, "The upload environment was not bound to the project")
    const binding = storageBindingResolve(environment, projectId)
    if (!binding.success) return binding
    const uploadId = parsed.output.uploadId ?? `upload-${crypto.randomUUID()}`
    const folders = parsed.output.folders
    const existing = db.select().from(uploadTable).where(eq(uploadTable.id, uploadId)).get()
    if (existing !== undefined) {
      if (!uploadRequestMatches(existing, projectId, environment.id, parsed.output))
        return resultErrorCreate(op, "The upload id already belongs to a different request")
      if (existing.status === "cancelled" || existing.status === "failed")
        return resultErrorCreate(op, "The upload cannot be resumed")
    } else {
      const staging = storageStagingObjectKeyCreate(binding.data, uploadId)
      if (!staging.success) return staging
      const createdAt = nowRead().toISOString()
      const inserted = databaseRecordInsert(db, uploadTable, {
        id: uploadId,
        projectId,
        environmentId: environment.id,
        assetId: null,
        sourceRevisionId: null,
        uploaderId: uploaderId ?? null,
        notificationEligible: uploaderId !== undefined,
        originalFilename: parsed.output.originalFilename,
        folder1: folders[0] ?? null,
        folder2: folders[1] ?? null,
        folder3: folders[2] ?? null,
        integrationNote: parsed.output.integrationNote,
        stagingObjectKey: staging.data.objectKey,
        byteSize: parsed.output.byteSize,
        mediaType: parsed.output.mediaType,
        sha256: parsed.output.sha256 ?? null,
        status: "pending",
        failureReason: null,
        verifiedAt: null,
        createdAt,
        updatedAt: createdAt,
      })
      if (!inserted.success) return inserted
    }

    const intent = await storageUploadIntentCreate(storage, {
      binding: binding.data,
      uploadId,
      byteSize: parsed.output.byteSize,
      mediaType: parsed.output.mediaType,
      ...(parsed.output.sha256 === undefined ? {} : { sha256: parsed.output.sha256 }),
      now: nowRead(),
    })
    if (!intent.success) return intent
    const current = db.select().from(uploadTable).where(eq(uploadTable.id, uploadId)).get()
    if (current === undefined) return resultErrorCreate(op, "The upload disappeared")
    return {
      success: true,
      data: {
        uploadId,
        status: current.status,
        intent: intent.data,
      },
    }
  }

  const uploadCompletionComplete = async (
    projectId: string,
    uploadId: string,
    input: UploadCompletionRequest,
  ): Promise<Result<import("../api-client/uploadCompletionResponseSchema.js").UploadCompletionResponse>> => {
    const op = "uploadApiRepositoryCompletionComplete"
    const parsed = v.safeParse(uploadCompletionRequestSchema, input)
    if (!parsed.success) return resultErrorCreate(op, "The upload completion was invalid", parsed.issues)
    const upload = db.select().from(uploadTable).where(eq(uploadTable.id, uploadId)).get()
    if (upload === undefined || upload.projectId !== projectId) return resultErrorCreate(op, "The upload was not found")
    if (upload.status === "accepted" && upload.assetId !== null && upload.sourceRevisionId !== null)
      return {
        success: true,
        data: {
          uploadId,
          assetId: upload.assetId,
          sourceRevisionId: upload.sourceRevisionId,
          workflowId: `workflow-upload-${uploadId}`,
          status: "accepted",
        },
      }
    if (upload.status === "cancelled") return resultErrorCreate(op, "Upload is cancelled")
    if (upload.stagingObjectKey === null || upload.mediaType === null)
      return resultErrorCreate(op, "The upload is incomplete")
    const environment = db
      .select()
      .from(environmentTable)
      .where(and(eq(environmentTable.id, upload.environmentId), eq(environmentTable.projectId, projectId)))
      .get()
    if (environment === undefined) return resultErrorCreate(op, "The upload environment was not found")
    const binding = storageBindingResolve(environment, projectId)
    if (!binding.success) return binding
    const staging = storageStagingObjectKeyCreate(binding.data, upload.id)
    if (!staging.success) return staging
    if (staging.data.objectKey !== upload.stagingObjectKey)
      return resultErrorCreate(op, "The upload staging key was invalid")
    const intent = await storageUploadIntentCreate(storage, {
      binding: binding.data,
      uploadId,
      byteSize: upload.byteSize,
      mediaType: upload.mediaType,
      sha256: parsed.output.sha256,
      now: nowRead(),
    })
    if (!intent.success) return intent
    const location = storageObjectLocationCreate(binding.data, "private-staging", `uploads/${uploadId}`)
    if (!location.success) return location
    const verified = await storageUploadIntentComplete(storage, {
      intent: intent.data,
      location: location.data,
      sha256: parsed.output.sha256,
      now: nowRead(),
    })
    if (!verified.success) return verified
    const markedVerified = databaseTransactionRun(db, (transaction) => {
      const current = transaction.select().from(uploadTable).where(eq(uploadTable.id, uploadId)).get()
      if (current === undefined || current.projectId !== projectId)
        return resultErrorCreate(op, "The upload was not found")
      if (current.status === "accepted") return { success: true, data: null } as const
      if (current.sha256 !== null && current.sha256 !== parsed.output.sha256)
        return resultErrorCreate(op, "The upload checksum did not match the intent")
      transaction
        .update(uploadTable)
        .set({
          sha256: parsed.output.sha256,
          mediaType: verified.data.mediaType,
          status: "verified",
          verifiedAt: nowRead().toISOString(),
          updatedAt: nowRead().toISOString(),
        })
        .where(eq(uploadTable.id, uploadId))
        .run()
      return { success: true, data: null } as const
    })
    if (!markedVerified.success) return markedVerified
    const accepted = await uploadIngestionComplete(db, storage, { uploadId })
    if (!accepted.success) return accepted
    return { success: true, data: { ...accepted.data, status: "accepted" } }
  }

  return { uploadIntentCreate, uploadCompletionComplete, uploadsRead, uploadRead: uploadReadById }
}

function uploadRequestMatches(
  upload: typeof uploadTable.$inferSelect,
  projectId: string,
  environmentId: string,
  input: UploadIntentRequest,
): boolean {
  return (
    upload.projectId === projectId &&
    upload.environmentId === environmentId &&
    upload.originalFilename === input.originalFilename &&
    upload.folder1 === (input.folders[0] ?? null) &&
    upload.folder2 === (input.folders[1] ?? null) &&
    upload.folder3 === (input.folders[2] ?? null) &&
    upload.integrationNote === input.integrationNote &&
    upload.byteSize === input.byteSize &&
    upload.mediaType === input.mediaType &&
    (input.sha256 === undefined || upload.sha256 === null || upload.sha256 === input.sha256)
  )
}
