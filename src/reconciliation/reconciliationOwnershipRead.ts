import { and, eq, lte } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { backupReceiptTable } from "../infrastructure/db/schema/backupReceiptTable.js"
import { blobTable } from "../infrastructure/db/schema/blobTable.js"
import { catalogOutputTable } from "../infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../infrastructure/db/schema/catalogTable.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { manifestTable } from "../infrastructure/db/schema/manifestTable.js"
import { outputVersionTable } from "../infrastructure/db/schema/outputVersionTable.js"
import { sourceRevisionTable } from "../infrastructure/db/schema/sourceRevisionTable.js"
import { uploadTable } from "../infrastructure/db/schema/uploadTable.js"
import { workflowTable } from "../infrastructure/db/schema/workflowTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { storageBindingResolve } from "../storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import { storageStagingObjectKeyCreate } from "../storage/storageStagingObjectKeyCreate.js"
import type { ReconciliationOwnership, ReconciliationStalledRecord } from "./reconciliationPlanBuild.js"

type ReconciliationOwnershipReadResult = {
  ownership: readonly ReconciliationOwnership[]
  stalledRecords: readonly ReconciliationStalledRecord[]
}

export const reconciliationOwnershipRead = (
  db: AssetDatabase,
  input: { now?: Date | string; minimumAgeMs?: number } = {},
): Result<ReconciliationOwnershipReadResult> => {
  const op = "reconciliationOwnershipRead"
  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now())
  if (Number.isNaN(now.getTime())) return resultErrorCreate(op, "Reconciliation time is invalid")
  const minimumAgeMs = input.minimumAgeMs ?? 24 * 60 * 60 * 1000
  if (!Number.isInteger(minimumAgeMs) || minimumAgeMs < 0)
    return resultErrorCreate(op, "Reconciliation minimum age must be a non-negative integer")
  const cutoff = new Date(now.getTime() - minimumAgeMs).toISOString()

  try {
    const environments = db.select().from(environmentTable).all()
    const environmentByIdentity = new Map(
      environments.map((environment) => [`${environment.projectId}:${environment.name}`, environment]),
    )
    const ownership: ReconciliationOwnership[] = []
    const blobs = db.select().from(blobTable).all()
    for (const blob of blobs) {
      const environment =
        blob.environment === null ? undefined : environmentByIdentity.get(`${blob.projectId}:${blob.environment}`)
      if (environment === undefined) continue
      const binding = storageBindingResolve(environment, blob.projectId)
      if (!binding.success) continue
      const namespace = blob.storage === "public" ? "public-output" : "private-source"
      const location = storageObjectLocationCreate(binding.data, namespace, blob.objectKey)
      if (!location.success) continue
      const ownershipRecord = blobOwnershipRead(db, blob)
      if (!ownershipRecord.success || ownershipRecord.data === null) continue
      const eligible = blobDeletionEligibilityRead(db, blob, environment.name, ownershipRecord.data)
      ownership.push({
        recordId: blob.id,
        bucket: location.data.bucket,
        objectKey: location.data.objectKey,
        kind: blob.storage === "public" ? "public" : "private",
        verifiedOwnership: true,
        eligibleForDeletion: eligible.eligible,
        reason: eligible.reason,
        lastModified: blob.createdAt,
        expectedByteSize: blob.byteSize,
        expectedSha256: blob.sha256,
      })
    }

    const uploads = db.select().from(uploadTable).all()
    for (const upload of uploads) {
      if (upload.stagingObjectKey === null) continue
      const environment = environmentByIdentity.get(
        `${upload.projectId}:${environmentNameRead(db, upload.environmentId)}`,
      )
      if (environment === undefined) continue
      const binding = storageBindingResolve(environment, upload.projectId)
      if (!binding.success) continue
      const expected = storageStagingObjectKeyCreate(binding.data, upload.id)
      if (!expected.success || expected.data.objectKey !== upload.stagingObjectKey) continue
      const eligible = uploadDeletionEligibilityRead(db, upload, environment.name)
      ownership.push({
        recordId: upload.id,
        bucket: expected.data.bucket,
        objectKey: expected.data.objectKey,
        kind: "staging",
        verifiedOwnership: true,
        eligibleForDeletion: eligible.eligible,
        reason: eligible.reason,
        lastModified: upload.updatedAt,
        expectedByteSize: upload.byteSize,
        ...(upload.sha256 === null ? {} : { expectedSha256: upload.sha256 }),
      })
    }

    const stalledRecords: ReconciliationStalledRecord[] = db
      .select()
      .from(jobTable)
      .where(and(eq(jobTable.status, "running"), lte(jobTable.leaseExpiresAt, now.toISOString())))
      .all()
      .filter((job) => job.leaseExpiresAt !== null)
      .map((job) => ({ recordId: job.id, reason: "expired_job_lease" }))
    for (const upload of uploads) {
      if ((upload.status !== "pending" && upload.status !== "verified") || upload.updatedAt > cutoff) continue
      stalledRecords.push({ recordId: upload.id, reason: "stalled_upload_requires_expiry_recovery" })
    }
    return { success: true, data: { ownership, stalledRecords } }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}

function environmentNameRead(db: AssetDatabase, environmentId: string): string {
  return (
    db
      .select({ name: environmentTable.name })
      .from(environmentTable)
      .where(eq(environmentTable.id, environmentId))
      .get()?.name ?? ""
  )
}

function blobOwnershipRead(
  db: AssetDatabase,
  blob: typeof blobTable.$inferSelect,
): Result<{ referenceId: string; kind: "source" | "output" | "manifest" } | null> {
  const asset =
    blob.assetId === null ? undefined : db.select().from(assetTable).where(eq(assetTable.id, blob.assetId)).get()
  if (blob.kind !== "manifest" && (asset === undefined || asset.projectId !== blob.projectId))
    return { success: true, data: null }
  if (blob.kind === "source" && blob.sourceRevisionId !== null) {
    if (asset === undefined) return { success: true, data: null }
    const source = db.select().from(sourceRevisionTable).where(eq(sourceRevisionTable.id, blob.sourceRevisionId)).get()
    if (source?.assetId === asset.id && source.objectKey === blob.objectKey)
      return { success: true, data: { referenceId: source.id, kind: "source" } }
  }
  if (blob.kind === "output" && blob.outputVersionId !== null) {
    if (asset === undefined) return { success: true, data: null }
    const version = db.select().from(outputVersionTable).where(eq(outputVersionTable.id, blob.outputVersionId)).get()
    if (version?.assetId === asset.id && version.objectKey === blob.objectKey)
      return { success: true, data: { referenceId: version.id, kind: "output" } }
  }
  if (blob.kind === "manifest") {
    const manifest = db.select().from(manifestTable).where(eq(manifestTable.objectKey, blob.objectKey)).get()
    if (manifest?.projectId === blob.projectId && manifest.objectKey === blob.objectKey) {
      if (manifest.assetId === null || manifest.assetId === asset?.id)
        return { success: true, data: { referenceId: manifest.id, kind: "manifest" } }
    }
  }
  return { success: true, data: null }
}

function blobDeletionEligibilityRead(
  db: AssetDatabase,
  blob: typeof blobTable.$inferSelect,
  environment: "development" | "production",
  reference: { referenceId: string; kind: "source" | "output" | "manifest" },
): { eligible: boolean; reason: string } {
  if (reference.kind === "source") return { eligible: false, reason: "source_object_is_retained" }
  if (reference.kind === "manifest") {
    const catalogGeneration = db
      .select({ generationId: catalogTable.generationId })
      .from(catalogTable)
      .where(and(eq(catalogTable.projectId, blob.projectId), eq(catalogTable.environment, environment)))
      .get()
    const manifest = db.select().from(manifestTable).where(eq(manifestTable.id, reference.referenceId)).get()
    if (manifest?.catalogGenerationId !== null && manifest?.catalogGenerationId === catalogGeneration?.generationId)
      return { eligible: false, reason: "current_catalog_manifest" }
    return catalogGeneration === undefined
      ? { eligible: false, reason: "catalog_is_not_available" }
      : { eligible: true, reason: "unreferenced_catalog_manifest" }
  }

  const version = db.select().from(outputVersionTable).where(eq(outputVersionTable.id, reference.referenceId)).get()
  if (version === undefined) return { eligible: false, reason: "output_version_is_missing" }
  const catalog = db
    .select()
    .from(catalogTable)
    .where(and(eq(catalogTable.projectId, blob.projectId), eq(catalogTable.environment, environment)))
    .get()
  if (catalog === undefined) return { eligible: false, reason: "catalog_is_not_available" }
  const currentOutput = db
    .select()
    .from(catalogOutputTable)
    .where(
      and(
        eq(catalogOutputTable.generationId, catalog.generationId),
        eq(catalogOutputTable.outputVersionId, version.id),
      ),
    )
    .get()
  if (currentOutput !== undefined) return { eligible: false, reason: "current_catalog_output" }
  if (blob.storage === "private") {
    const publicCopy = db
      .select({ id: blobTable.id })
      .from(blobTable)
      .where(
        and(
          eq(blobTable.storage, "public"),
          eq(blobTable.objectKey, blob.objectKey),
          eq(blobTable.outputVersionId, version.id),
        ),
      )
      .get()
    if (publicCopy === undefined) return { eligible: false, reason: "private_output_has_no_public_copy" }
    return { eligible: true, reason: "unreferenced_private_output_with_public_copy" }
  }
  return { eligible: true, reason: "unreferenced_public_output" }
}

function uploadDeletionEligibilityRead(
  db: AssetDatabase,
  upload: typeof uploadTable.$inferSelect,
  environment: "development" | "production",
): { eligible: boolean; reason: string } {
  if (upload.status === "failed" || upload.status === "cancelled") return { eligible: true, reason: "terminal_upload" }
  if (upload.status !== "accepted") return { eligible: false, reason: "upload_is_not_terminal" }
  if (upload.assetId === null || upload.sourceRevisionId === null)
    return { eligible: false, reason: "accepted_upload_has_no_owner" }
  const workflow = db
    .select()
    .from(workflowTable)
    .where(eq(workflowTable.id, `workflow-upload-${upload.id}`))
    .get()
  if (workflow?.status !== "succeeded") return { eligible: false, reason: "publication_workflow_is_not_complete" }
  const catalog = db
    .select({ id: catalogTable.id })
    .from(catalogTable)
    .where(and(eq(catalogTable.projectId, upload.projectId), eq(catalogTable.environment, environment)))
    .get()
  if (catalog === undefined) return { eligible: false, reason: "catalog_is_not_available" }
  const source = db.select().from(sourceRevisionTable).where(eq(sourceRevisionTable.id, upload.sourceRevisionId)).get()
  const backup =
    source === undefined
      ? undefined
      : db
          .select()
          .from(backupReceiptTable)
          .where(
            and(
              eq(backupReceiptTable.projectId, upload.projectId),
              eq(backupReceiptTable.sourceRevisionId, source.id),
              eq(backupReceiptTable.checkResult, "verified"),
              eq(backupReceiptTable.byteSize, source.byteSize),
              eq(backupReceiptTable.sha256, source.sha256),
            ),
          )
          .get()
  if (backup === undefined) return { eligible: false, reason: "verified_backup_receipt_is_missing" }
  if (!backup.remotePath.startsWith("gdrive_beta:"))
    return { eligible: false, reason: "verified_gdrive_backup_receipt_is_missing" }
  return { eligible: true, reason: "accepted_upload_is_published_and_backed_up" }
}
