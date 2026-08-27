import { and, asc, eq, inArray, or } from "drizzle-orm"
import * as v from "valibot"
import type { RcloneBackupDeleteAdapter } from "../backup/rcloneBackupDeleteAdapter.js"
import { canonicalJsonDigest } from "../catalog/canonicalJsonDigest.js"
import { canonicalJsonStringify } from "../catalog/canonicalJsonStringify.js"
import { catalogSchema } from "../catalog/catalogSchema.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { assetMetadataTable } from "../infrastructure/db/schema/assetMetadataTable.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { auditEventTable } from "../infrastructure/db/schema/auditEventTable.js"
import { backupReceiptTable } from "../infrastructure/db/schema/backupReceiptTable.js"
import { blobTable } from "../infrastructure/db/schema/blobTable.js"
import { catalogGenerationTable } from "../infrastructure/db/schema/catalogGenerationTable.js"
import { catalogOutputTable } from "../infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../infrastructure/db/schema/catalogTable.js"
import { deletionStateTable } from "../infrastructure/db/schema/deletionStateTable.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { manifestTable } from "../infrastructure/db/schema/manifestTable.js"
import { outboxEventTable } from "../infrastructure/db/schema/outboxEventTable.js"
import { outputDefinitionTable } from "../infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../infrastructure/db/schema/outputVersionTable.js"
import { projectTable } from "../infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../infrastructure/db/schema/sourceRevisionTable.js"
import { uploadTable } from "../infrastructure/db/schema/uploadTable.js"
import { workflowTable } from "../infrastructure/db/schema/workflowTable.js"
import { contentSha256Create } from "../schemas/contentSha256Create.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import { storageBindingResolve } from "../storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import { storageStagingObjectKeyCreate } from "../storage/storageStagingObjectKeyCreate.js"
import type { JobHandler } from "../workflow/jobHandler.js"
import type { Job } from "../workflow/jobSchema.js"
import { type DeletionState, deletionStateSchema } from "./deletionStateSchema.js"

type AssetDeletionHandleInput = {
  db: AssetDatabase
  storage: StorageAdapter
  backupDelete?: RcloneBackupDeleteAdapter
  clock?: () => Date
}

type RemotePlan = {
  tokens: string[]
}

type CatalogReplacement = {
  oldGeneration: typeof catalogGenerationTable.$inferSelect
  targetGeneration: typeof catalogGenerationTable.$inferInsert
  outputs: Array<typeof catalogOutputTable.$inferInsert>
  manifest: typeof manifestTable.$inferInsert
  environment: typeof environmentTable.$inferSelect
}

const planStep = "plan:remote-objects"
const catalogStep = "database:catalog"
const recordsStep = "database:records"
const assetStep = "database:asset"

export const assetDeletionHandle = async (
  job: Job,
  handlerContext: Parameters<JobHandler>[1],
  input: AssetDeletionHandleInput,
): Promise<Result<null>> => {
  const op = "assetDeletionHandle"
  const parsedJob = v.safeParse(
    v.strictObject({
      assetId: v.pipe(v.string(), v.minLength(1)),
      deletionId: v.pipe(v.string(), v.minLength(1)),
    }),
    job.payload,
  )
  if (!parsedJob.success) return resultErrorCreate(op, "Deletion job payload is invalid", parsedJob.issues)

  const deletionRecord = input.db
    .select()
    .from(deletionStateTable)
    .where(eq(deletionStateTable.id, parsedJob.output.deletionId))
    .get()
  if (deletionRecord === undefined) return resultErrorCreate(op, "Deletion state was not found")
  if (deletionRecord.assetId !== parsedJob.output.assetId)
    return resultErrorCreate(op, "Deletion job does not match its deletion state")
  if (deletionRecord.status === "succeeded") return { success: true, data: null }

  let state = deletionStateRead(deletionRecord)
  if (!state.success) return state
  const now = input.clock?.().toISOString() ?? new Date().toISOString()
  const asset = input.db.select().from(assetTable).where(eq(assetTable.id, state.data.assetId)).get()
  if (asset === undefined) {
    return deletionFailurePersist(
      input.db,
      state.data,
      job,
      now,
      "The asset disappeared before deletion completed",
      "asset_missing",
    )
  }

  if (!state.data.completedSteps.includes(planStep) && state.data.pendingRemoteObjects.length === 0) {
    const plan = deletionRemotePlanRead(input.db, asset)
    if (!plan.success) return deletionFailurePersist(input.db, state.data, job, now, plan.errorMessage, "plan_failed")
    const initialized = deletionStateUpdate(input.db, state.data, {
      status: "in_progress",
      completedSteps: [...state.data.completedSteps, planStep],
      pendingRemoteObjects: plan.data.tokens,
      error: null,
      updatedAt: now,
      completedAt: null,
    })
    if (!initialized.success) return initialized
    state = initialized
  }

  for (const token of state.data.pendingRemoteObjects) {
    const deleted = await remoteObjectDelete(
      input.db,
      input.storage,
      input.backupDelete,
      asset,
      token,
      handlerContext.signal,
    )
    if (!deleted.success)
      return deletionFailurePersist(input.db, state.data, job, now, deleted.errorMessage, "remote_delete_failed", token)
    const completed = deletionStateUpdate(input.db, state.data, {
      status: "in_progress",
      completedSteps: [...state.data.completedSteps, `remote:${token}`],
      pendingRemoteObjects: state.data.pendingRemoteObjects.filter((pending) => pending !== token),
      error: null,
      updatedAt: input.clock?.().toISOString() ?? new Date().toISOString(),
      completedAt: null,
    })
    if (!completed.success) return completed
    state = completed
  }

  const replacements = await catalogReplacementsPrepare(input.db, input.storage, asset)
  if (!replacements.success)
    return deletionFailurePersist(input.db, state.data, job, now, replacements.errorMessage, "catalog_prepare_failed")

  const finalized = databaseTransactionRun<null>(
    input.db,
    (transaction) => deletionFinalize(transaction, asset, state.data, replacements.data, now),
    { behavior: "immediate" },
  )
  if (!finalized.success)
    return deletionFailurePersist(input.db, state.data, job, now, finalized.errorMessage, "database_cleanup_failed")
  return finalized
}

function deletionStateRead(record: typeof deletionStateTable.$inferSelect): Result<DeletionState> {
  const { error, completedAt, ...state } = record
  const parsed = v.safeParse(deletionStateSchema, {
    ...state,
    ...(error === null ? {} : { error }),
    ...(completedAt === null ? {} : { completedAt }),
  })
  if (!parsed.success) return resultErrorCreate("assetDeletionStateRead", v.summarize(parsed.issues))
  return { success: true, data: parsed.output }
}

function deletionStateUpdate(
  db: AssetDatabase,
  state: DeletionState,
  update: {
    status: DeletionState["status"]
    completedSteps: string[]
    pendingRemoteObjects: string[]
    error: Record<string, unknown> | null
    updatedAt: string
    completedAt: string | null
  },
): Result<DeletionState> {
  try {
    const updated = db
      .update(deletionStateTable)
      .set(update)
      .where(eq(deletionStateTable.id, state.id))
      .returning()
      .get()
    if (updated === undefined) return resultErrorCreate("assetDeletionStateUpdate", "The deletion state disappeared")
    return deletionStateRead(updated)
  } catch (error) {
    return resultErrorCreate("assetDeletionStateUpdate", error instanceof Error ? error.message : String(error))
  }
}

function deletionFailurePersist(
  db: AssetDatabase,
  state: DeletionState,
  job: Job,
  now: string,
  message: string,
  code: string,
  target?: string,
): Result<never> {
  const status = job.attempts > job.retryLimit ? "failed" : "retryable"
  const persisted = deletionStateUpdate(db, state, {
    status,
    completedSteps: state.completedSteps,
    pendingRemoteObjects: state.pendingRemoteObjects,
    error: { code, message, ...(target === undefined ? {} : { target }) },
    updatedAt: now,
    completedAt: null,
  })
  if (!persisted.success) return persisted
  return resultErrorCreate("assetDeletionHandle", message)
}

function deletionRemotePlanRead(db: AssetDatabase, asset: typeof assetTable.$inferSelect): Result<RemotePlan> {
  const environments = db
    .select()
    .from(environmentTable)
    .where(eq(environmentTable.projectId, asset.projectId))
    .orderBy(asc(environmentTable.name))
    .all()
  if (environments.length === 0)
    return resultErrorCreate("deletionRemotePlanRead", "The asset has no storage environment")

  const tokens = new Set<string>()
  const add = (namespace: string, environment: string, key: string) => {
    if (key.length > 0) tokens.add(`r2:${namespace}:${environment}:${encodeURIComponent(key)}`)
  }
  const addForEnvironments = (namespace: string, key: string) => {
    for (const environment of environments) add(namespace, environment.name, key)
  }
  const environmentByName = new Map(environments.map((environment) => [environment.name, environment]))
  const sources = db.select().from(sourceRevisionTable).where(eq(sourceRevisionTable.assetId, asset.id)).all()
  const versions = db.select().from(outputVersionTable).where(eq(outputVersionTable.assetId, asset.id)).all()
  const sourceIds = sources.map((source) => source.id)
  const versionIds = versions.map((version) => version.id)
  const blobConditions = [eq(blobTable.assetId, asset.id)]
  if (sourceIds.length > 0) blobConditions.push(inArray(blobTable.sourceRevisionId, sourceIds))
  if (versionIds.length > 0) blobConditions.push(inArray(blobTable.outputVersionId, versionIds))
  const blobs = db
    .select()
    .from(blobTable)
    .where(or(...blobConditions))
    .orderBy(asc(blobTable.storage), asc(blobTable.objectKey), asc(blobTable.id))
    .all()

  for (const source of sources) {
    const matching = blobs.filter((blob) => blob.sourceRevisionId === source.id && blob.kind === "source")
    if (matching.length === 0) addForEnvironments("private-source", source.objectKey)
  }
  for (const version of versions) {
    const matching = blobs.filter((blob) => blob.outputVersionId === version.id && blob.kind === "output")
    if (matching.length === 0) {
      addForEnvironments("private-source", `outputs/${version.id}.${version.extension}`)
      addForEnvironments("public-output", version.objectKey)
    }
  }
  for (const blob of blobs) {
    const namespace =
      blob.storage === "public" ? "public-output" : blob.kind === "staging" ? "private-staging" : "private-source"
    const environmentNames =
      blob.environment === null ? environments.map((environment) => environment.name) : [blob.environment]
    for (const environmentName of environmentNames) {
      const environment = environmentByName.get(environmentName)
      if (environment === undefined) continue
      const binding = storageBindingResolve(environment, asset.projectId)
      if (!binding.success) return binding
      const key = storageKeyRead(namespace, binding.data.prefix, blob.objectKey)
      add(namespace, environmentName, key)
    }
  }

  const uploads = db.select().from(uploadTable).where(eq(uploadTable.assetId, asset.id)).all()
  for (const upload of uploads) {
    const environment = environments.find((candidate) => candidate.id === upload.environmentId)
    if (environment === undefined) continue
    const binding = storageBindingResolve(environment, asset.projectId)
    if (!binding.success) return binding
    const location = storageStagingObjectKeyCreate(binding.data, upload.id)
    if (!location.success) return location
    add("private-staging", environment.name, location.data.key)
  }

  for (const manifest of db.select().from(manifestTable).where(eq(manifestTable.assetId, asset.id)).all())
    addForEnvironments("private-source", manifest.objectKey)

  const catalogGenerationIds = new Set(
    db
      .select({ generationId: catalogOutputTable.generationId })
      .from(catalogOutputTable)
      .where(eq(catalogOutputTable.assetId, asset.id))
      .all()
      .map((output) => output.generationId),
  )
  for (const generationId of catalogGenerationIds) {
    const generation = db.select().from(catalogGenerationTable).where(eq(catalogGenerationTable.id, generationId)).get()
    const manifest = db.select().from(manifestTable).where(eq(manifestTable.catalogGenerationId, generationId)).get()
    if (generation !== undefined && manifest !== undefined)
      add("private-source", generation.environment, manifest.objectKey)
  }

  for (const sourceId of sourceIds) {
    const receipts = db.select().from(backupReceiptTable).where(eq(backupReceiptTable.sourceRevisionId, sourceId)).all()
    for (const receipt of receipts) {
      if (!receipt.remotePath.startsWith("gdrive_beta:"))
        return resultErrorCreate("deletionRemotePlanRead", "A backup receipt uses a non-gdrive_beta remote")
      tokens.add(`gdrive:${encodeURIComponent(receipt.remotePath)}`)
    }
  }

  const sortedTokens = [...tokens].sort((left, right) => {
    const rank = (token: string) =>
      token.startsWith("r2:public-output:")
        ? 0
        : token.startsWith("r2:private-source:")
          ? 1
          : token.startsWith("r2:private-staging:")
            ? 2
            : 3
    return rank(left) - rank(right) || left.localeCompare(right)
  })
  return { success: true, data: { tokens: sortedTokens } }
}

async function remoteObjectDelete(
  db: AssetDatabase,
  storage: StorageAdapter,
  backupDelete: RcloneBackupDeleteAdapter | undefined,
  asset: typeof assetTable.$inferSelect,
  token: string,
  signal: AbortSignal,
): Promise<Result<null>> {
  if (token.startsWith("gdrive:")) {
    if (backupDelete === undefined)
      return resultErrorCreate("remoteObjectDelete", "gdrive_beta deletion is not configured")
    let remotePath: string
    try {
      remotePath = decodeURIComponent(token.slice("gdrive:".length))
    } catch {
      return resultErrorCreate("remoteObjectDelete", "The backup deletion token was invalid")
    }
    try {
      const deleted = await backupDelete(remotePath, { signal })
      if (!deleted.success) return deleted
      return { success: true, data: null }
    } catch (error) {
      return resultErrorCreate("remoteObjectDelete", error instanceof Error ? error.message : String(error))
    }
  }
  const location = deletionLocationRead(db, asset.projectId, token)
  if (!location.success) return location
  try {
    const deleted = await storage.deleteObject(location.data)
    if (!deleted.success) return deleted
    return { success: true, data: null }
  } catch (error) {
    return resultErrorCreate("remoteObjectDelete", error instanceof Error ? error.message : String(error))
  }
}

function deletionLocationRead(
  db: AssetDatabase,
  projectId: string,
  token: string,
): Result<Parameters<StorageAdapter["deleteObject"]>[0]> {
  const parts = token.split(":")
  if (parts.length !== 4 || parts[0] !== "r2")
    return resultErrorCreate("deletionLocationRead", "The R2 deletion token was invalid")
  const namespace = parts[1]
  const environmentName = parts[2]
  if (namespace !== "private-staging" && namespace !== "private-source" && namespace !== "public-output")
    return resultErrorCreate("deletionLocationRead", "The R2 namespace was invalid")
  let key: string
  try {
    key = decodeURIComponent(parts[3] ?? "")
  } catch {
    return resultErrorCreate("deletionLocationRead", "The R2 object key was invalid")
  }
  const environment = db
    .select()
    .from(environmentTable)
    .where(
      and(
        eq(environmentTable.projectId, projectId),
        eq(environmentTable.name, environmentName as "development" | "production"),
      ),
    )
    .get()
  if (environment === undefined)
    return resultErrorCreate("deletionLocationRead", "The storage environment was not found")
  const binding = storageBindingResolve(environment, projectId)
  if (!binding.success) return binding
  return storageObjectLocationCreate(binding.data, namespace, key)
}

function storageKeyRead(namespace: string, prefix: string, objectKey: string): string {
  const root =
    namespace === "private-staging" ? "private/staging" : namespace === "private-source" ? "private/source" : "public"
  const fullPrefix = prefix.length > 0 ? `${prefix}/${root}/` : `${root}/`
  return objectKey.startsWith(fullPrefix) ? objectKey.slice(fullPrefix.length) : objectKey
}

async function catalogReplacementsPrepare(
  db: AssetDatabase,
  storage: StorageAdapter,
  asset: typeof assetTable.$inferSelect,
): Promise<Result<CatalogReplacement[]>> {
  const impactedIds = db
    .select({ generationId: catalogOutputTable.generationId })
    .from(catalogOutputTable)
    .where(eq(catalogOutputTable.assetId, asset.id))
    .all()
    .map((output) => output.generationId)
  const impacted = [...new Set(impactedIds)]
  const replacements: CatalogReplacement[] = []
  for (const generationId of impacted) {
    const oldGeneration = db
      .select()
      .from(catalogGenerationTable)
      .where(eq(catalogGenerationTable.id, generationId))
      .get()
    if (oldGeneration === undefined)
      return resultErrorCreate("catalogReplacementsPrepare", "Catalog generation was not found")
    const environment = db
      .select()
      .from(environmentTable)
      .where(and(eq(environmentTable.projectId, asset.projectId), eq(environmentTable.name, oldGeneration.environment)))
      .get()
    if (environment === undefined)
      return resultErrorCreate("catalogReplacementsPrepare", "Catalog environment was not found")
    const outputs = db
      .select()
      .from(catalogOutputTable)
      .where(eq(catalogOutputTable.generationId, generationId))
      .all()
      .filter((output) => output.assetId !== asset.id)
      .sort(
        (left, right) =>
          left.property.localeCompare(right.property) || left.outputVersionId.localeCompare(right.outputVersionId),
      )
    const manifestOutputs = outputs.map(({ generationId: _generationId, ...output }) => output)
    const digest = canonicalJsonDigest(manifestOutputs)
    const parsed = v.safeParse(catalogSchema, {
      schema: "assets.catalog.v1",
      projectId: asset.projectId,
      environment: oldGeneration.environment,
      digest,
      rendererVersion: oldGeneration.rendererVersion,
      generatedAt: oldGeneration.createdAt,
      outputs: manifestOutputs,
    })
    if (!parsed.success)
      return resultErrorCreate("catalogReplacementsPrepare", "The replacement catalog was invalid", parsed.issues)
    const manifestBytes = new TextEncoder().encode(canonicalJsonStringify(parsed.output))
    const manifestSha256 = contentSha256Create(manifestBytes)
    const existingTarget = db
      .select()
      .from(catalogGenerationTable)
      .where(
        and(
          eq(catalogGenerationTable.projectId, asset.projectId),
          eq(catalogGenerationTable.environment, oldGeneration.environment),
          eq(catalogGenerationTable.digest, digest),
        ),
      )
      .all()
      .find((candidate) => !impacted.includes(candidate.id))
    const targetId =
      existingTarget?.id ??
      `catalog-generation-delete-${canonicalJsonDigest({ assetId: asset.id, generationId, digest })}`
    const targetGeneration = existingTarget ?? {
      id: targetId,
      projectId: asset.projectId,
      environment: oldGeneration.environment,
      digest,
      manifestObjectKey: `catalogs/${oldGeneration.environment}/${digest}.json`,
      rendererVersion: oldGeneration.rendererVersion,
      createdAt: oldGeneration.createdAt,
    }
    const binding = storageBindingResolve(environment, asset.projectId)
    if (!binding.success) return binding
    const location = storageObjectLocationCreate(binding.data, "private-source", targetGeneration.manifestObjectKey)
    if (!location.success) return location
    const stored = await storageObjectPutEnsure(storage, location.data, manifestBytes, manifestSha256)
    if (!stored.success) return stored
    replacements.push({
      oldGeneration,
      targetGeneration,
      outputs: outputs.map((output) => ({ ...output, generationId: targetGeneration.id })),
      manifest: {
        id: `manifest-${targetGeneration.id}`,
        projectId: asset.projectId,
        assetId: null,
        catalogGenerationId: targetGeneration.id,
        kind: "catalog",
        schema: "assets.catalog.v1",
        objectKey: targetGeneration.manifestObjectKey,
        byteSize: manifestBytes.byteLength,
        sha256: manifestSha256,
        createdAt: targetGeneration.createdAt,
      },
      environment,
    })
  }
  return { success: true, data: replacements }
}

async function storageObjectPutEnsure(
  storage: StorageAdapter,
  location: Parameters<StorageAdapter["putImmutable"]>[0]["location"],
  bytes: Uint8Array,
  sha256: string,
): Promise<Result<null>> {
  const existing = await storage.headObject(location)
  if (!existing.success) return existing
  if (existing.data !== null) {
    if (
      existing.data.byteSize !== bytes.byteLength ||
      (existing.data.sha256 !== undefined && existing.data.sha256 !== sha256)
    )
      return resultErrorCreate("storageObjectPutEnsure", "The replacement catalog object does not match its manifest")
    return { success: true, data: null }
  }
  const stored = await storage.putImmutable({ location, bytes, mediaType: "application/json", sha256 })
  if (stored.success) return { success: true, data: null }
  const raced = await storage.headObject(location)
  if (!raced.success) return raced
  if (raced.data?.byteSize === bytes.byteLength && (raced.data.sha256 === undefined || raced.data.sha256 === sha256))
    return { success: true, data: null }
  return stored
}

function deletionFinalize(
  transaction: AssetDatabase,
  asset: typeof assetTable.$inferSelect,
  state: DeletionState,
  replacements: CatalogReplacement[],
  now: string,
): Result<null> {
  const op = "deletionFinalize"
  const currentAsset = transaction.select().from(assetTable).where(eq(assetTable.id, asset.id)).get()
  if (currentAsset === undefined) return resultErrorCreate(op, "The asset disappeared during deletion")
  if (currentAsset.updatedAt !== asset.updatedAt)
    return resultErrorCreate(op, "The asset changed while deletion was in progress")
  const currentState = transaction.select().from(deletionStateTable).where(eq(deletionStateTable.id, state.id)).get()
  if (currentState === undefined) return resultErrorCreate(op, "The deletion state disappeared during finalization")
  if (currentState.updatedAt !== state.updatedAt)
    return resultErrorCreate(op, "The deletion state changed while deletion was in progress")

  for (const replacement of replacements) {
    const currentGeneration = transaction
      .select()
      .from(catalogGenerationTable)
      .where(eq(catalogGenerationTable.id, replacement.oldGeneration.id))
      .get()
    const currentCatalog = transaction
      .select()
      .from(catalogTable)
      .where(eq(catalogTable.generationId, replacement.oldGeneration.id))
      .get()
    if (
      currentGeneration === undefined ||
      currentGeneration.digest !== replacement.oldGeneration.digest ||
      currentCatalog === undefined
    )
      return resultErrorCreate(op, "The catalog changed while deletion was in progress")
  }

  const sourceIds = transaction
    .select({ id: sourceRevisionTable.id })
    .from(sourceRevisionTable)
    .where(eq(sourceRevisionTable.assetId, asset.id))
    .all()
    .map(({ id }) => id)
  const versionIds = transaction
    .select({ id: outputVersionTable.id })
    .from(outputVersionTable)
    .where(eq(outputVersionTable.assetId, asset.id))
    .all()
    .map(({ id }) => id)
  const uploadIds = transaction
    .select({ id: uploadTable.id })
    .from(uploadTable)
    .where(eq(uploadTable.assetId, asset.id))
    .all()
    .map(({ id }) => id)

  for (const replacement of replacements) {
    const existingGeneration = transaction
      .select()
      .from(catalogGenerationTable)
      .where(eq(catalogGenerationTable.id, replacement.targetGeneration.id))
      .get()
    if (existingGeneration === undefined) {
      const inserted = databaseRecordInsert(transaction, catalogGenerationTable, replacement.targetGeneration)
      if (!inserted.success) return inserted
      const manifest = databaseRecordInsert(transaction, manifestTable, replacement.manifest)
      if (!manifest.success) return manifest
      const blob = databaseRecordInsert(transaction, blobTable, {
        id: `blob-manifest-${replacement.targetGeneration.id}`,
        projectId: asset.projectId,
        assetId: null,
        sourceRevisionId: null,
        outputVersionId: null,
        storage: "private",
        environment: replacement.environment.name,
        kind: "manifest",
        objectKey: replacement.manifest.objectKey,
        byteSize: replacement.manifest.byteSize,
        sha256: replacement.manifest.sha256,
        mediaType: "application/json",
        createdAt: replacement.manifest.createdAt,
      })
      if (!blob.success) return blob
      for (const output of replacement.outputs) {
        const insertedOutput = databaseRecordInsert(transaction, catalogOutputTable, output)
        if (!insertedOutput.success) return insertedOutput
      }
    }
    transaction
      .update(catalogTable)
      .set({
        generationId: replacement.targetGeneration.id,
        digest: replacement.targetGeneration.digest,
        generatedAt: replacement.targetGeneration.createdAt,
        updatedAt: now,
      })
      .where(eq(catalogTable.generationId, replacement.oldGeneration.id))
      .run()
  }

  for (const replacement of replacements) {
    transaction
      .delete(blobTable)
      .where(
        and(eq(blobTable.storage, "private"), eq(blobTable.objectKey, replacement.oldGeneration.manifestObjectKey)),
      )
      .run()
    transaction.delete(catalogGenerationTable).where(eq(catalogGenerationTable.id, replacement.oldGeneration.id)).run()
  }
  transaction.delete(manifestTable).where(eq(manifestTable.assetId, asset.id)).run()
  if (sourceIds.length > 0)
    transaction.delete(backupReceiptTable).where(inArray(backupReceiptTable.sourceRevisionId, sourceIds)).run()
  const assetBlobConditions = [eq(blobTable.assetId, asset.id)]
  if (sourceIds.length > 0) assetBlobConditions.push(inArray(blobTable.sourceRevisionId, sourceIds))
  if (versionIds.length > 0) assetBlobConditions.push(inArray(blobTable.outputVersionId, versionIds))
  transaction
    .delete(blobTable)
    .where(or(...assetBlobConditions))
    .run()
  transaction.delete(assetMetadataTable).where(eq(assetMetadataTable.assetId, asset.id)).run()
  if (uploadIds.length > 0) {
    for (const uploadId of uploadIds)
      transaction
        .delete(outboxEventTable)
        .where(eq(outboxEventTable.eventId, `customer-asset-uploaded:${uploadId}`))
        .run()
    transaction.delete(uploadTable).where(inArray(uploadTable.id, uploadIds)).run()
  }
  transaction.delete(outputVersionTable).where(eq(outputVersionTable.assetId, asset.id)).run()
  transaction.delete(outputDefinitionTable).where(eq(outputDefinitionTable.assetId, asset.id)).run()
  transaction
    .delete(workflowTable)
    .where(and(eq(workflowTable.assetId, asset.id), eq(workflowTable.kind, "asset_processing")))
    .run()

  const project = transaction.select().from(projectTable).where(eq(projectTable.id, asset.projectId)).get()
  if (project === undefined) return resultErrorCreate(op, "The project was not found during deletion")
  const auditId = `audit-deletion-completed-${asset.id}`
  const existingAudit = transaction.select().from(auditEventTable).where(eq(auditEventTable.id, auditId)).get()
  if (existingAudit === undefined) {
    const audit = databaseRecordInsert(transaction, auditEventTable, {
      id: auditId,
      organizationId: project.organizationId,
      projectId: asset.projectId,
      actorId: "system:deletion",
      action: "asset.deleted",
      resourceType: "asset",
      resourceId: asset.id,
      details: { deletionId: state.id, completedSteps: state.completedSteps.length },
      createdAt: now,
    })
    if (!audit.success) return audit
  }
  const deletedAsset = transaction
    .delete(assetTable)
    .where(eq(assetTable.id, asset.id))
    .returning({ id: assetTable.id })
    .get()
  if (deletedAsset === undefined) return resultErrorCreate(op, "The asset disappeared during deletion")
  const completed = transaction
    .update(deletionStateTable)
    .set({
      status: "succeeded",
      completedSteps: [...state.completedSteps, catalogStep, recordsStep, assetStep],
      pendingRemoteObjects: [],
      error: null,
      updatedAt: now,
      completedAt: now,
    })
    .where(eq(deletionStateTable.id, state.id))
    .returning({ id: deletionStateTable.id })
    .get()
  if (completed === undefined) return resultErrorCreate(op, "The deletion state disappeared during finalization")
  return { success: true, data: null }
}
