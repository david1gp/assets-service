import { and, asc, eq } from "drizzle-orm"
import * as v from "valibot"
import { resolve, relative } from "node:path"

import { assetBasenameCreate } from "../asset/assetBasenameCreate.js"
import { foldersDatabaseColumnsCreate } from "../asset/foldersDatabaseColumnsCreate.js"
import { foldersDatabaseColumnsRead } from "../asset/foldersDatabaseColumnsRead.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { assetMetadataTable } from "../infrastructure/db/schema/assetMetadataTable.js"
import { blobTable } from "../infrastructure/db/schema/blobTable.js"
import { catalogGenerationTable } from "../infrastructure/db/schema/catalogGenerationTable.js"
import { catalogOutputTable } from "../infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../infrastructure/db/schema/catalogTable.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { jobDependencyTable } from "../infrastructure/db/schema/jobDependencyTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { legacyImportTable } from "../infrastructure/db/schema/legacyImportTable.js"
import { manifestTable } from "../infrastructure/db/schema/manifestTable.js"
import { outputDefinitionTable } from "../infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../infrastructure/db/schema/outputVersionTable.js"
import { projectTable } from "../infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../infrastructure/db/schema/sourceRevisionTable.js"
import { workflowTable } from "../infrastructure/db/schema/workflowTable.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { catalogEntryPropertyCreate } from "../catalog/catalogEntryPropertyCreate.js"
import { catalogListsRender } from "../catalog/catalogListsRender.js"
import { canonicalJsonDigest } from "../catalog/canonicalJsonDigest.js"
import type { LegacyImportRequest } from "../api-client/legacyImportRequestSchema.js"
import { legacyImportRequestSchema } from "../api-client/legacyImportRequestSchema.js"
import { legacyImportConflictSchema, type LegacyImportConflict } from "./legacyImportConflictSchema.js"
import type { LegacyImportExecutor } from "./legacyImportExecutor.js"
import { legacyImportPlanCreate } from "./legacyImportPlanCreate.js"
import { legacyImportStatusSchema, type LegacyImportStatus } from "./legacyImportStatusSchema.js"
import { mediaMetadataSchema, type MediaMetadata } from "../metadata/mediaMetadataSchema.js"
import type { Environment } from "../project/environmentSchema.js"
import { environmentSchema } from "../project/environmentSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import { storageBindingResolve } from "../storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import type { StorageObjectLocation } from "../storage/storageObjectLocation.js"
import { outputRemoteObjectKeyCreate } from "../output/outputRemoteObjectKeyCreate.js"
import { workflowJobCreate } from "../workflow/workflowJobCreate.js"
import type { JobPayload } from "../workflow/jobPayloadSchema.js"
import type { Job } from "../workflow/jobSchema.js"

type LegacyImportPlan = Extract<Awaited<ReturnType<typeof legacyImportPlanCreate>>, { success: true }>["data"]
type LegacyImportGroup = LegacyImportPlan["groups"][number]
type LegacyImportOutput = LegacyImportGroup["outputs"][number]
type ImportEnvironment = Environment

type LegacyImportExecutorCreateInput = {
  db: AssetDatabase
  storage: StorageAdapter
  sourceRoot?: string
  sourceRoots?: readonly string[]
  showAiLabel?: boolean
  now?: () => Date
}

type PreparedOutput = {
  output: LegacyImportOutput
  definitionId: string
  versionId: string
  relativeObjectKey: string
  location: StorageObjectLocation & { bucket: string; objectKey: string }
  privateLocation: StorageObjectLocation & { bucket: string; objectKey: string }
}

type PreparedGroup = {
  group: LegacyImportGroup
  projectId: string
  environmentId: string
  assetId: string
  sourceId: string
  sourceLocation: StorageObjectLocation & { bucket: string; objectKey: string }
  outputs: PreparedOutput[]
}

type GroupPrepareResult = { success: true; data: PreparedGroup } | { success: false; conflict: LegacyImportConflict }

export const legacyImportExecutorCreate = (input: LegacyImportExecutorCreateInput): LegacyImportExecutor => {
  const roots = (input.sourceRoots ?? (input.sourceRoot === undefined ? [] : [input.sourceRoot])).map((root) =>
    resolve(root),
  )
  const nowRead = input.now ?? (() => new Date())

  const legacyImportRequestCreate: LegacyImportExecutor["legacyImportRequestCreate"] = async (
    projectId,
    actorId,
    request,
  ) => {
    const op = "legacyImportRequestCreate"
    const parsed = v.safeParse(legacyImportRequestSchema, request)
    if (!parsed.success) return resultErrorCreate(op, "The legacy import request was invalid", parsed.issues)
    const root = resolve(parsed.output.root)
    if (!rootAllowedRead(root, roots)) return resultErrorCreate(op, "The source tree is not explicitly configured")

    const environment = environmentRead(projectId, parsed.output.environment)
    if (!environment.success) return environment
    if (environment.data === null) return resultErrorCreate(op, "The import environment was not found")
    const atomicity = parsed.output.atomicity ?? "all_or_nothing"
    const showAiLabel = parsed.output.showAiLabel ?? input.showAiLabel
    const importId = `import-${canonicalJsonDigest({ projectId, root, environment: environment.data.name, atomicity, showAiLabel: showAiLabel ?? null })}`
    const existing = input.db.select().from(legacyImportTable).where(eq(legacyImportTable.id, importId)).get()
    if (existing !== undefined) return legacyImportStatusReadFromRecord(existing)

    const createdAt = nowRead().toISOString()
    const inserted = databaseRecordInsert(input.db, legacyImportTable, {
      id: importId,
      projectId,
      actorId,
      root,
      environment: environment.data.name,
      atomicity,
      status: "queued",
      importedCount: 0,
      conflicts: [],
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
    })
    if (!inserted.success) return inserted

    const running = importStatusUpdate(importId, { status: "running", updatedAt: nowRead().toISOString() })
    if (!running.success) return running
    const plan = await legacyImportPlanCreate(root, { showAiLabel })
    if (!plan.success) {
      const conflict = conflictCreate(root, "source_tree_read_failed", plan.errorMessage)
      const failed = importStatusUpdate(importId, {
        status: "failed",
        conflicts: [conflict],
        completedAt: nowRead().toISOString(),
        updatedAt: nowRead().toISOString(),
      })
      if (!failed.success) return failed
      return statusRequiredRead(projectId, importId)
    }

    const conflicts = [...plan.data.conflicts]
    const importableGroups = plan.data.groups.filter((group) => !group.conflict)
    if (atomicity === "all_or_nothing" && conflicts.length > 0) {
      const failed = importStatusUpdate(importId, {
        status: "failed",
        conflicts: conflicts.sort(conflictCompare),
        completedAt: nowRead().toISOString(),
        updatedAt: nowRead().toISOString(),
      })
      if (!failed.success) return failed
      return statusRequiredRead(projectId, importId)
    }

    const prepared = await groupsPrepare(importableGroups, environment.data)
    if (atomicity === "all_or_nothing" && prepared.some((result) => !result.success)) {
      for (const result of prepared) if (!result.success) conflicts.push(result.conflict)
      const failed = importStatusUpdate(importId, {
        status: "failed",
        conflicts: conflicts.sort(conflictCompare),
        completedAt: nowRead().toISOString(),
        updatedAt: nowRead().toISOString(),
      })
      if (!failed.success) return failed
      return statusRequiredRead(projectId, importId)
    }
    let importedCount = 0
    for (const result of prepared) {
      if (!result.success) {
        conflicts.push(result.conflict)
        continue
      }
      const recorded = groupRecordsCreate(input.db, result.data, environment.data, importId, nowRead().toISOString())
      if (!recorded.success) {
        conflicts.push(conflictCreate(result.data.group.sourcePath, "record_create_failed", recorded.errorMessage))
        continue
      }
      importedCount += 1
    }

    const completedStatus =
      conflicts.length > 0 && importedCount === 0 ? "failed" : importedCount > 0 ? "queued" : "succeeded"
    const completed = importStatusUpdate(importId, {
      status: completedStatus,
      importedCount,
      conflicts: conflicts.sort(conflictCompare),
      ...(completedStatus === "queued" ? {} : { completedAt: nowRead().toISOString() }),
      updatedAt: nowRead().toISOString(),
    })
    if (!completed.success) return completed
    return statusRequiredRead(projectId, importId)
  }

  const legacyImportStatusRead = (projectId: string, importId: string): Result<LegacyImportStatus | null> => {
    const record = input.db
      .select()
      .from(legacyImportTable)
      .where(and(eq(legacyImportTable.projectId, projectId), eq(legacyImportTable.id, importId)))
      .get()
    if (record === undefined) return { success: true, data: null }
    return legacyImportStatusReadFromRecord(record)
  }

  const legacyImportsRead: NonNullable<LegacyImportExecutor["legacyImportsRead"]> = (projectId, options) => {
    const records = input.db
      .select()
      .from(legacyImportTable)
      .where(
        and(
          eq(legacyImportTable.projectId, projectId),
          ...(options.status === undefined ? [] : [eq(legacyImportTable.status, options.status)]),
        ),
      )
      .orderBy(asc(legacyImportTable.createdAt), asc(legacyImportTable.id))
      .all()
    const offset = options.cursor ?? 0
    const limit = Math.min(100, Math.max(1, options.limit ?? 50))
    const selected = records.slice(offset, offset + limit + 1)
    const items: LegacyImportStatus[] = []
    for (const record of selected.slice(0, limit)) {
      const parsed = legacyImportStatusReadFromRecord(record)
      if (!parsed.success) return parsed
      items.push(parsed.data)
    }
    return { success: true, data: { items, nextCursor: selected.length > limit ? offset + limit : null } }
  }

  function statusRequiredRead(projectId: string, importId: string): Result<LegacyImportStatus> {
    const status = legacyImportStatusRead(projectId, importId)
    if (!status.success) return status
    if (status.data === null) return resultErrorCreate("legacyImportStatusRead", "The import disappeared")
    return { success: true, data: status.data }
  }

  function importStatusUpdate(
    importId: string,
    values: {
      status?: "queued" | "running" | "succeeded" | "failed" | "cancelled"
      importedCount?: number
      conflicts?: LegacyImportConflict[]
      updatedAt: string
      completedAt?: string
    },
  ): Result<null> {
    try {
      input.db.update(legacyImportTable).set(values).where(eq(legacyImportTable.id, importId)).run()
      return { success: true, data: null }
    } catch (error) {
      return resultErrorCreate("legacyImportStatusUpdate", errorMessageCreate(error))
    }
  }

  function environmentRead(
    projectId: string,
    requestedName?: ImportEnvironment["name"],
  ): Result<ImportEnvironment | null> {
    const project = input.db.select().from(projectTable).where(eq(projectTable.id, projectId)).get()
    if (project === undefined) return { success: true, data: null }
    const name = requestedName ?? project.defaultEnvironment
    const record = input.db
      .select()
      .from(environmentTable)
      .where(and(eq(environmentTable.projectId, projectId), eq(environmentTable.name, name)))
      .get()
    if (record === undefined) return { success: true, data: null }
    const parsed = v.safeParse(environmentSchema, record)
    if (!parsed.success) return resultErrorCreate("legacyImportEnvironmentRead", "The stored environment was invalid")
    return { success: true, data: parsed.output }
  }

  return { legacyImportRequestCreate, legacyImportStatusRead, legacyImportsRead }

  async function groupsPrepare(
    groups: readonly LegacyImportGroup[],
    environment: ImportEnvironment,
  ): Promise<GroupPrepareResult[]> {
    const binding = storageBindingResolve(environment)
    if (!binding.success)
      return groups.map((group) => ({
        success: false,
        conflict: conflictCreate(group.sourcePath, "storage_binding_invalid", binding.errorMessage),
      }))
    const prepared: GroupPrepareResult[] = []
    for (const group of groups) {
      const result = await groupPrepare(group, binding.data, environment.id)
      prepared.push(result)
    }
    return prepared
  }

  async function groupPrepare(
    group: LegacyImportGroup,
    binding: NonNullable<Extract<ReturnType<typeof storageBindingResolve>, { success: true }>["data"]>,
    environmentId: string,
  ): Promise<GroupPrepareResult> {
    const assetId = `asset-${canonicalJsonDigest({ projectId: binding.projectId, class: group.class, folders: group.folders, basename: group.basename })}`
    const sourceId = `source-${canonicalJsonDigest({ assetId, sha256: group.sourceSha256 })}`
    const sourceKey = `sources/${assetId}/v1/${group.filename}`
    const sourceLocation = storageObjectLocationCreate(binding, "private-source", sourceKey)
    if (!sourceLocation.success)
      return {
        success: false,
        conflict: conflictCreate(group.sourcePath, "source_location_invalid", sourceLocation.errorMessage),
      }
    const storedSource = await storageEnsure(
      sourceLocation.data,
      group.sourceBytes,
      group.sourceMediaType,
      group.sourceSha256,
    )
    if (!storedSource.success)
      return {
        success: false,
        conflict: conflictCreate(group.sourcePath, "source_store_failed", storedSource.errorMessage),
      }

    const outputs: PreparedOutput[] = []
    for (const output of group.outputs) {
      const definitionId = `output-${canonicalJsonDigest({ assetId, output: outputDefinitionInputRead(output) })}`
      const versionId = `output-version-${canonicalJsonDigest({ definitionId, sha256: output.sha256 })}`
      const relativeObjectKey = outputRemoteObjectKeyCreate({
        assetClass: group.class,
        folders: group.folders,
        basename: group.basename,
        outputKey: output.key,
        version: 1,
        extension: outputExtensionRead(output),
      })
      const location = storageObjectLocationCreate(binding, "public-output", relativeObjectKey)
      if (!location.success)
        return {
          success: false,
          conflict: conflictCreate(group.sourcePath, "output_location_invalid", location.errorMessage),
        }
      const privateLocation = storageObjectLocationCreate(
        binding,
        "private-source",
        `outputs/${versionId}.${outputExtensionRead(output)}`,
      )
      if (!privateLocation.success)
        return {
          success: false,
          conflict: conflictCreate(group.sourcePath, "output_location_invalid", privateLocation.errorMessage),
        }
      const stored = await storageEnsure(privateLocation.data, output.bytes, output.mediaType, output.sha256)
      if (!stored.success)
        return {
          success: false,
          conflict: conflictCreate(group.sourcePath, "output_store_failed", stored.errorMessage),
        }
      outputs.push({
        output,
        definitionId,
        versionId,
        relativeObjectKey,
        location: location.data,
        privateLocation: privateLocation.data,
      })
    }
    return {
      success: true,
      data: {
        group,
        projectId: binding.projectId,
        environmentId,
        assetId,
        sourceId,
        sourceLocation: sourceLocation.data,
        outputs,
      },
    }
  }

  async function storageEnsure(
    location: StorageObjectLocation & { bucket: string; objectKey: string },
    bytes: Uint8Array,
    mediaType: string,
    sha256: string,
  ): Promise<Result<null>> {
    const existing = await input.storage.headObject(location)
    if (!existing.success) return existing
    if (existing.data !== null) {
      if (
        existing.data.sha256 !== sha256 ||
        existing.data.byteSize !== bytes.byteLength ||
        existing.data.mediaType !== mediaType
      )
        return resultErrorCreate("legacyImportStorageEnsure", "An immutable object has different bytes")
      return { success: true, data: null }
    }
    const inserted = await input.storage.putImmutable({ location, bytes, mediaType, sha256 })
    if (inserted.success) return { success: true, data: null }
    const raced = await input.storage.headObject(location)
    if (
      raced.success &&
      raced.data !== null &&
      raced.data.sha256 === sha256 &&
      raced.data.byteSize === bytes.byteLength
    )
      return { success: true, data: null }
    return inserted
  }
}

function groupRecordsCreate(
  db: AssetDatabase,
  prepared: PreparedGroup,
  environment: ImportEnvironment,
  importId: string,
  now: string,
): Result<null> {
  return databaseTransactionRun(
    db,
    (transaction) => {
      const columns = foldersDatabaseColumnsCreate(prepared.group.folders)
      if (!columns.success) return columns
      const existingAsset = transaction.select().from(assetTable).where(eq(assetTable.id, prepared.assetId)).get()
      if (existingAsset !== undefined) {
        if (existingAsset.projectId !== prepared.projectId || existingAsset.class !== prepared.group.class)
          return resultErrorCreate("legacyImportRecordsCreate", "The existing asset identity does not match")
      }
      const currentSource =
        existingAsset === undefined
          ? undefined
          : transaction
              .select()
              .from(sourceRevisionTable)
              .where(eq(sourceRevisionTable.id, existingAsset.currentSourceRevisionId))
              .get()
      if (
        currentSource !== undefined &&
        (currentSource.sha256 !== prepared.group.sourceSha256 ||
          currentSource.byteSize !== prepared.group.sourceByteSize)
      )
        return resultErrorCreate("legacyImportRecordsCreate", "The existing asset has different source bytes")
      if (existingAsset === undefined) {
        const insertedAsset = databaseRecordInsert(transaction, assetTable, {
          id: prepared.assetId,
          projectId: prepared.projectId,
          class: prepared.group.class,
          ...columns.data,
          filename: prepared.group.filename,
          basename: assetBasenameCreate(prepared.group.filename),
          currentSourceRevisionId: prepared.sourceId,
          integrationNote: "legacy import",
          createdAt: now,
          updatedAt: now,
        })
        if (!insertedAsset.success) return insertedAsset
      } else if (existingAsset.currentSourceRevisionId !== prepared.sourceId) {
        transaction
          .update(assetTable)
          .set({ currentSourceRevisionId: prepared.sourceId, updatedAt: now })
          .where(eq(assetTable.id, prepared.assetId))
          .run()
      }

      const source = transaction
        .select()
        .from(sourceRevisionTable)
        .where(eq(sourceRevisionTable.id, prepared.sourceId))
        .get()
      if (source === undefined) {
        const insertedSource = databaseRecordInsert(transaction, sourceRevisionTable, {
          id: prepared.sourceId,
          assetId: prepared.assetId,
          revision: currentSource?.revision ?? 1,
          class: prepared.group.class,
          originalFilename: prepared.group.filename,
          mediaType: prepared.group.sourceMediaType,
          byteSize: prepared.group.sourceByteSize,
          sha256: prepared.group.sourceSha256,
          objectKey: prepared.sourceLocation.key,
          createdAt: now,
        })
        if (!insertedSource.success) return insertedSource
      }
      const sourceBlobRecord = {
        id: `blob-source-${prepared.sourceId}`,
        projectId: prepared.projectId,
        assetId: prepared.assetId,
        sourceRevisionId: prepared.sourceId,
        outputVersionId: null,
        storage: "private" as const,
        environment: environment.name,
        kind: "source" as const,
        objectKey: prepared.sourceLocation.key,
        byteSize: prepared.group.sourceByteSize,
        sha256: prepared.group.sourceSha256,
        mediaType: prepared.group.sourceMediaType,
        createdAt: now,
      }
      const existingSourceBlob = transaction.select().from(blobTable).where(eq(blobTable.id, sourceBlobRecord.id)).get()
      if (existingSourceBlob === undefined) {
        const sourceBlob = databaseRecordInsert(transaction, blobTable, sourceBlobRecord)
        if (!sourceBlob.success) return sourceBlob
      }

      const metadata = mediaMetadataRead(prepared.group)
      if (!metadata.success) return metadata
      const existingMetadata = transaction
        .select()
        .from(assetMetadataTable)
        .where(eq(assetMetadataTable.assetId, prepared.assetId))
        .get()
      if (existingMetadata === undefined) {
        const insertedMetadata = databaseRecordInsert(transaction, assetMetadataTable, {
          id: `metadata-${prepared.assetId}`,
          assetId: prepared.assetId,
          sourceRevisionId: prepared.sourceId,
          metadata: metadata.data,
          createdAt: now,
          updatedAt: now,
        })
        if (!insertedMetadata.success) return insertedMetadata
      }

      for (const output of prepared.outputs) {
        const definition = outputDefinitionRecordCreate(prepared, output, now)
        const existingDefinition = transaction
          .select()
          .from(outputDefinitionTable)
          .where(eq(outputDefinitionTable.id, definition.id))
          .get()
        if (existingDefinition === undefined) {
          const insertedDefinition = databaseRecordInsert(transaction, outputDefinitionTable, definition)
          if (!insertedDefinition.success) return insertedDefinition
        }
        const version = outputVersionRecordCreate(prepared, output, now)
        const existingVersion = transaction
          .select()
          .from(outputVersionTable)
          .where(eq(outputVersionTable.id, version.id))
          .get()
        if (existingVersion === undefined) {
          const insertedVersion = databaseRecordInsert(transaction, outputVersionTable, version)
          if (!insertedVersion.success) return insertedVersion
        }
        const outputBlobRecord = {
          id: `blob-output-${output.versionId}`,
          projectId: prepared.projectId,
          assetId: prepared.assetId,
          sourceRevisionId: null,
          outputVersionId: output.versionId,
          storage: "private" as const,
          environment: environment.name,
          kind: "output" as const,
          objectKey: output.privateLocation.key,
          byteSize: output.output.byteSize,
          sha256: output.output.sha256,
          mediaType: output.output.mediaType,
          createdAt: now,
        }
        const existingOutputBlob = transaction
          .select()
          .from(blobTable)
          .where(eq(blobTable.id, outputBlobRecord.id))
          .get()
        if (existingOutputBlob === undefined) {
          const blob = databaseRecordInsert(transaction, blobTable, outputBlobRecord)
          if (!blob.success) return blob
        }
      }
      const workflowId = `workflow-import-${canonicalJsonDigest({ importId, assetId: prepared.assetId }).slice(0, 32)}`
      const workflow = transaction.select().from(workflowTable).where(eq(workflowTable.id, workflowId)).get()
      if (workflow === undefined) {
        const insertedWorkflow = databaseRecordInsert(transaction, workflowTable, {
          id: workflowId,
          projectId: prepared.projectId,
          assetId: prepared.assetId,
          kind: "asset_processing",
          status: "queued",
          createdAt: now,
          updatedAt: now,
        })
        if (!insertedWorkflow.success) return insertedWorkflow
      }
      const context = {
        assetId: prepared.assetId,
        sourceRevisionId: prepared.sourceId,
        environmentId: prepared.environmentId,
        legacyImportId: importId,
      }
      const verifyJob = importJobCreate(
        `${workflowId}-verify`,
        workflowId,
        "verify_original",
        context,
        now,
        "succeeded",
      )
      const backupJob = importJobCreate(`${workflowId}-backup`, workflowId, "backup_original", context, now, "queued")
      const planJob = importJobCreate(`${workflowId}-plan`, workflowId, "plan_outputs", context, now, "succeeded")
      const outputJobs: ReturnType<typeof importJobCreate>[] = []
      for (const output of prepared.outputs) {
        const definition = transaction
          .select()
          .from(outputDefinitionTable)
          .where(eq(outputDefinitionTable.id, output.definitionId))
          .get()
        const version = transaction
          .select()
          .from(outputVersionTable)
          .where(eq(outputVersionTable.id, output.versionId))
          .get()
        if (definition === undefined || version === undefined)
          return resultErrorCreate("legacyImportRecordsCreate", "Import output job data is missing")
        const outputMetadata = catalogMetadataRead(prepared.group.class, definition, version, metadata.data)
        if (!outputMetadata.success) return outputMetadata
        const kind =
          definition.kind === "image"
            ? "process_image_output"
            : definition.kind === "video"
              ? "copy_video_output"
              : "process_font_output"
        outputJobs.push(
          importJobCreate(
            `${workflowId}-output-${definition.id}`,
            workflowId,
            kind,
            {
              ...context,
              outputDefinitionId: definition.id,
              values: {
                outputVersionId: version.id,
                metadata: outputMetadata.data,
                provenance: { schemaVersion: "legacy-import-v1", toolchain: [{ name: "legacy-import", version: "1" }] },
              },
            },
            now,
            "succeeded",
          ),
        )
      }
      const publishJob = importJobCreate(`${workflowId}-publish`, workflowId, "publish_asset", context, now, "queued")
      const jobs = [verifyJob, backupJob, planJob, ...outputJobs, publishJob]
      for (const job of jobs) {
        const existingJob = transaction.select().from(jobTable).where(eq(jobTable.id, job.id)).get()
        if (existingJob === undefined) {
          const insertedJob = databaseRecordInsert(transaction, jobTable, job)
          if (!insertedJob.success) return insertedJob
        }
      }
      const dependencies = [
        dependencyCreate(`${workflowId}-dependency-backup`, backupJob.id, verifyJob.id, now),
        dependencyCreate(`${workflowId}-dependency-plan`, planJob.id, backupJob.id, now),
        ...outputJobs.map((job) => dependencyCreate(`${job.id}-dependency-plan`, job.id, planJob.id, now)),
        dependencyCreate(`${publishJob.id}-dependency-plan`, publishJob.id, planJob.id, now),
        ...outputJobs.map((job) =>
          dependencyCreate(`${publishJob.id}-dependency-${job.id}`, publishJob.id, job.id, now),
        ),
      ]
      for (const dependency of dependencies) {
        const existingDependency = transaction
          .select()
          .from(jobDependencyTable)
          .where(
            and(
              eq(jobDependencyTable.jobId, dependency.jobId),
              eq(jobDependencyTable.dependsOnJobId, dependency.dependsOnJobId),
            ),
          )
          .get()
        if (existingDependency === undefined) {
          const insertedDependency = databaseRecordInsert(transaction, jobDependencyTable, dependency)
          if (!insertedDependency.success) return insertedDependency
        }
      }
      return { success: true, data: null }
    },
    { behavior: "immediate" },
  )
}

function importJobCreate(
  id: string,
  workflowId: string,
  kind: Job["kind"],
  payload: JobPayload,
  now: string,
  status: "queued" | "succeeded",
) {
  return { ...workflowJobCreate({ id, workflowId, kind, payload, now, retryLimit: 3 }), status }
}

function dependencyCreate(id: string, jobId: string, dependsOnJobId: string, createdAt: string) {
  return { id, jobId, dependsOnJobId, createdAt }
}

function catalogRecordsCreate(
  db: AssetDatabase,
  projectId: string,
  environment: ImportEnvironment,
  now: string,
): Result<null> {
  const rows = db
    .select()
    .from(assetTable)
    .where(eq(assetTable.projectId, projectId))
    .orderBy(asc(assetTable.class), asc(assetTable.basename), asc(assetTable.id))
    .all()
  const entries: Array<Record<string, unknown>> = []
  const outputVersionIds = new Map<string, string>()
  for (const asset of rows) {
    const folders = foldersDatabaseColumnsRead({
      folder1: asset.folder1,
      folder2: asset.folder2,
      folder3: asset.folder3,
    })
    if (!folders.success) return folders
    const metadataRow = db.select().from(assetMetadataTable).where(eq(assetMetadataTable.assetId, asset.id)).get()
    let metadata: MediaMetadata | null = null
    if (metadataRow !== undefined) {
      const parsedMetadata = v.safeParse(mediaMetadataSchema, metadataRow.metadata)
      if (!parsedMetadata.success)
        return resultErrorCreate("legacyImportCatalogCreate", "Stored asset metadata is invalid")
      metadata = parsedMetadata.output
    }
    const definitions = db
      .select()
      .from(outputDefinitionTable)
      .where(eq(outputDefinitionTable.assetId, asset.id))
      .orderBy(asc(outputDefinitionTable.key))
      .all()
    for (const definition of definitions) {
      const version = db
        .select()
        .from(outputVersionTable)
        .where(and(eq(outputVersionTable.outputDefinitionId, definition.id), eq(outputVersionTable.current, true)))
        .get()
      if (version === undefined) continue
      const outputMetadata = catalogMetadataRead(asset.class, definition, version, metadata)
      if (!outputMetadata.success) return outputMetadata
      const path = outputPathRead(version.objectKey)
      if (!path.success) return path
      const entry = {
        class: asset.class,
        folders: folders.data,
        basename: asset.basename,
        key: definition.key,
        path: path.data,
        mediaType: version.mediaType,
        metadata: outputMetadata.data,
      }
      entries.push(entry)
      outputVersionIds.set(catalogEntryPropertyCreate(entry as never), version.id)
    }
  }
  const rendered = catalogListsRender(entries)
  if (!rendered.success) return rendered
  const digest = rendered.data.digest
  const generationId = `catalog-generation-${canonicalJsonDigest({ projectId, environment: environment.name, digest })}`
  const manifestId = `manifest-${generationId}`
  const inserted = databaseTransactionRun(db, (transaction) => {
    const generation = transaction
      .select()
      .from(catalogGenerationTable)
      .where(eq(catalogGenerationTable.id, generationId))
      .get()
    if (generation === undefined) {
      const created = databaseRecordInsert(transaction, catalogGenerationTable, {
        id: generationId,
        projectId,
        environment: environment.name,
        digest,
        manifestObjectKey: `manifests/${generationId}.json`,
        rendererVersion: "1",
        createdAt: now,
      })
      if (!created.success) return created
    }
    const manifest = transaction.select().from(manifestTable).where(eq(manifestTable.id, manifestId)).get()
    if (manifest === undefined) {
      const created = databaseRecordInsert(transaction, manifestTable, {
        id: manifestId,
        projectId,
        assetId: null,
        catalogGenerationId: generationId,
        kind: "catalog",
        schema: "assets.manifest.v1",
        objectKey: `manifests/${generationId}.json`,
        byteSize: 0,
        sha256: digest,
        createdAt: now,
      })
      if (!created.success) return created
    }
    for (const entry of entries) {
      const outputVersionId = outputVersionIds.get(catalogEntryPropertyCreate(entry as never))
      if (outputVersionId === undefined)
        return resultErrorCreate("legacyImportCatalogCreate", "Catalog output version is missing")
      const existingOutput = transaction
        .select()
        .from(catalogOutputTable)
        .where(
          and(
            eq(catalogOutputTable.generationId, generationId),
            eq(catalogOutputTable.outputVersionId, outputVersionId),
          ),
        )
        .get()
      if (existingOutput !== undefined) continue
      const entryFolders = entry.folders as string[]
      const asset = transaction
        .select()
        .from(assetTable)
        .where(and(eq(assetTable.projectId, projectId), eq(assetTable.basename, String(entry.basename))))
        .all()
        .find(
          (candidate) =>
            candidate.class === entry.class &&
            candidate.folder1 === (entryFolders[0] ?? null) &&
            candidate.folder2 === (entryFolders[1] ?? null) &&
            candidate.folder3 === (entryFolders[2] ?? null),
        )
      if (asset === undefined) return resultErrorCreate("legacyImportCatalogCreate", "Catalog asset is missing")
      const created = databaseRecordInsert(transaction, catalogOutputTable, {
        generationId,
        assetId: asset.id,
        outputVersionId,
        class: entry.class as "image" | "video" | "font",
        key: String(entry.key),
        property: catalogEntryPropertyCreate(entry as never),
        path: String(entry.path),
        metadata: entry.metadata as MediaMetadata,
      })
      if (!created.success) return created
    }
    const current = transaction
      .select()
      .from(catalogTable)
      .where(and(eq(catalogTable.projectId, projectId), eq(catalogTable.environment, environment.name)))
      .get()
    const catalogValues = {
      projectId,
      environment: environment.name,
      generationId,
      schema: "assets.catalog.v1",
      digest,
      rendererVersion: "1",
      generatedAt: now,
      updatedAt: now,
    }
    if (current === undefined) {
      const created = databaseRecordInsert(transaction, catalogTable, {
        id: `catalog-${generationId}`,
        ...catalogValues,
      })
      if (!created.success) return created
    } else {
      transaction.update(catalogTable).set(catalogValues).where(eq(catalogTable.id, current.id)).run()
    }
    return { success: true, data: null } as const
  })
  return inserted
}

function outputDefinitionRecordCreate(prepared: PreparedGroup, output: PreparedOutput, now: string) {
  if (output.output.kind === "image")
    return {
      id: output.definitionId,
      assetId: prepared.assetId,
      kind: "image" as const,
      key: output.output.key,
      width: output.output.width,
      height: output.output.height,
      format: output.output.format,
      quality: null,
      showAiLabel: output.output.showAiLabel ?? null,
      createdAt: now,
      updatedAt: now,
    }
  if (output.output.kind === "video")
    return {
      id: output.definitionId,
      assetId: prepared.assetId,
      kind: "video" as const,
      key: output.output.key,
      width: null,
      height: null,
      format: null,
      quality: null,
      showAiLabel: null,
      createdAt: now,
      updatedAt: now,
    }
  return {
    id: output.definitionId,
    assetId: prepared.assetId,
    kind: "font" as const,
    key: output.output.key,
    width: null,
    height: null,
    format: output.output.format,
    quality: null,
    showAiLabel: null,
    createdAt: now,
    updatedAt: now,
  }
}

function outputVersionRecordCreate(prepared: PreparedGroup, output: PreparedOutput, now: string) {
  const dimensions =
    output.output.kind === "image"
      ? { width: output.output.width, height: output.output.height }
      : { width: null, height: null }
  return {
    id: output.versionId,
    outputDefinitionId: output.definitionId,
    assetId: prepared.assetId,
    version: 1,
    byteSize: output.output.byteSize,
    sha256: output.output.sha256,
    mediaType: output.output.mediaType,
    extension: outputExtensionRead(output.output),
    objectKey: output.relativeObjectKey,
    toolchainVersion: "legacy-import-v1",
    ...dimensions,
    current: false,
    createdAt: now,
  }
}

function outputDefinitionInputRead(output: LegacyImportOutput): Record<string, unknown> {
  if (output.kind === "image")
    return {
      kind: output.kind,
      key: output.key,
      width: output.width,
      height: output.height,
      format: output.format,
      ...(output.showAiLabel === undefined ? {} : { showAiLabel: output.showAiLabel }),
    }
  if (output.kind === "font") return { kind: output.kind, key: output.key, format: output.format }
  return { kind: output.kind, key: output.key }
}

function outputExtensionRead(output: LegacyImportOutput): string {
  if (output.kind === "image") return output.format
  if (output.kind === "font") return output.format
  return output.mediaType === "video/quicktime" ? "mov" : output.mediaType === "video/webm" ? "webm" : "mp4"
}

function mediaMetadataRead(group: LegacyImportGroup): Result<MediaMetadata> {
  const value =
    group.class === "image"
      ? {
          kind: "image" as const,
          ...(group.imageMetadata ?? {
            width: 1,
            height: 1,
            format: "webp" as const,
            colorSpace: "srgb",
            alpha: false,
            orientationApplied: false,
            frameCount: 1,
            animated: false,
            alt: group.alt,
            aiProvenance: group.aiProvenance,
          }),
        }
      : group.class === "video"
        ? {
            kind: "video" as const,
            ...(group.videoMetadata ?? {
              width: 1,
              height: 1,
              durationSeconds: 0,
              frameRate: 0,
              container: "unknown",
              videoCodec: "unknown",
              audioCodec: null,
              streams: 1,
              bitrate: null,
            }),
          }
        : {
            kind: "font" as const,
            ...(group.fontMetadata ?? {
              family: group.basename,
              style: "normal",
              weight: 400,
              width: 5,
              variableAxes: [],
              glyphCount: 0,
              unicodeRanges: [],
              format: "woff2",
            }),
          }
  const parsed = v.safeParse(mediaMetadataSchema, value)
  if (!parsed.success)
    return resultErrorCreate("legacyImportMetadataCreate", "The imported metadata was invalid", parsed.issues)
  return { success: true, data: parsed.output }
}

function catalogMetadataRead(
  className: "image" | "video" | "font",
  definition: typeof outputDefinitionTable.$inferSelect,
  version: typeof outputVersionTable.$inferSelect,
  sourceMetadata: MediaMetadata | null,
): Result<MediaMetadata> {
  if (className === "image") {
    const source =
      sourceMetadata?.kind === "image"
        ? sourceMetadata
        : {
            kind: "image" as const,
            width: version.width ?? 1,
            height: version.height ?? 1,
            format: (definition.format ?? "webp") as "jpg" | "png" | "webp" | "avif",
            colorSpace: "srgb",
            alpha: false,
            orientationApplied: false,
            frameCount: 1,
            animated: false,
            alt: null,
            aiProvenance: null,
          }
    const parsed = v.safeParse(mediaMetadataSchema, {
      ...source,
      width: version.width ?? source.width,
      height: version.height ?? source.height,
      format: definition.format ?? source.format,
    })
    return parsed.success
      ? { success: true, data: parsed.output }
      : resultErrorCreate("legacyImportCatalogMetadata", "The image metadata was invalid", parsed.issues)
  }
  if (className === "video") {
    const source =
      sourceMetadata?.kind === "video"
        ? sourceMetadata
        : {
            kind: "video" as const,
            width: 1,
            height: 1,
            durationSeconds: 0,
            frameRate: 0,
            container: "unknown",
            videoCodec: "unknown",
            audioCodec: null,
            streams: 1,
            bitrate: null,
          }
    return { success: true, data: source }
  }
  const source =
    sourceMetadata?.kind === "font"
      ? sourceMetadata
      : {
          kind: "font" as const,
          family: "unknown",
          style: "normal",
          weight: 400,
          width: 5,
          variableAxes: [],
          glyphCount: 0,
          unicodeRanges: [],
          format: "woff2",
        }
  return { success: true, data: source }
}

function outputPathRead(objectKey: string): Result<string> {
  const marker = "/public/"
  const index = objectKey.indexOf(marker)
  if (index < 0) return resultErrorCreate("legacyImportCatalogPath", "The output object key is not public")
  return { success: true, data: objectKey.slice(index + marker.length) }
}

function legacyImportStatusReadFromRecord(record: typeof legacyImportTable.$inferSelect): Result<LegacyImportStatus> {
  const parsedConflicts = v.safeParse(v.array(legacyImportConflictSchema), record.conflicts)
  if (!parsedConflicts.success)
    return resultErrorCreate("legacyImportStatusRead", "The stored import conflicts were invalid")
  const parsedStatus = v.safeParse(legacyImportStatusSchema, {
    id: record.id,
    projectId: record.projectId,
    status: record.status,
    importedCount: record.importedCount,
    conflicts: parsedConflicts.output,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
  })
  if (!parsedStatus.success) return resultErrorCreate("legacyImportStatusRead", "The stored import status was invalid")
  return { success: true, data: parsedStatus.output }
}

function rootAllowedRead(root: string, roots: readonly string[]): boolean {
  return roots.some((configured) => {
    const remainder = relative(configured, root)
    return remainder === "" || (!remainder.startsWith("..") && !remainder.startsWith("/"))
  })
}

function conflictCreate(path: string, code: string, message: string): LegacyImportConflict {
  return { path, code, message }
}

function conflictCompare(left: LegacyImportConflict, right: LegacyImportConflict): number {
  const pathOrder = left.path.localeCompare(right.path)
  if (pathOrder !== 0) return pathOrder
  const codeOrder = left.code.localeCompare(right.code)
  if (codeOrder !== 0) return codeOrder
  return left.message.localeCompare(right.message)
}

function errorMessageCreate(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
