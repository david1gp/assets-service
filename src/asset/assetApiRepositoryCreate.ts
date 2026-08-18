import { and, asc, eq } from "drizzle-orm"
import * as v from "valibot"
import { outputDefinitionInputSchema } from "../api-client/outputDefinitionInputSchema.js"
import { outputSetRequestSchema } from "../api-client/outputSetRequestSchema.js"
import { canonicalJsonDigest } from "../catalog/canonicalJsonDigest.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { assetMetadataTable } from "../infrastructure/db/schema/assetMetadataTable.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { deletionStateTable } from "../infrastructure/db/schema/deletionStateTable.js"
import { outputDefinitionTable } from "../infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../infrastructure/db/schema/outputVersionTable.js"
import { sourceRevisionTable } from "../infrastructure/db/schema/sourceRevisionTable.js"
import { assetMetadataSchema } from "../metadata/assetMetadataSchema.js"
import { mediaMetadataSchema } from "../metadata/mediaMetadataSchema.js"
import { outputDefinitionSchema } from "../output/outputDefinitionSchema.js"
import { outputKeySchema } from "../output/outputKeySchema.js"
import { outputVersionSchema } from "../output/outputVersionSchema.js"
import type { AssetClass } from "../schemas/assetClassSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { sourceRevisionSchema } from "../upload/sourceRevisionSchema.js"
import { assetProcessingWorkflowEnqueue } from "../workflow/assetProcessingWorkflowEnqueue.js"
import {
  type AssetApiMutation,
  type AssetApiRepository,
  type AssetDetail,
  type AssetMoveInput,
  type AssetOutputHistory,
  type AssetOutputSetInput,
} from "./assetApiRepository.js"
import { assetBasenameCreate } from "./assetBasenameCreate.js"
import { assetFilenameSchema } from "./assetFilenameSchema.js"
import { assetSchema } from "./assetSchema.js"
import { assetSourcePathCreate } from "./assetSourcePathCreate.js"
import { foldersDatabaseColumnsCreate } from "./foldersDatabaseColumnsCreate.js"
import { foldersDatabaseColumnsRead } from "./foldersDatabaseColumnsRead.js"
import { foldersSchema } from "./foldersSchema.js"

export const assetApiRepositoryCreate = (db: AssetDatabase): AssetApiRepository => {
  const assetRecordRead = (record: typeof assetTable.$inferSelect): Result<AssetDetail> => {
    const folders = foldersDatabaseColumnsRead({
      folder1: record.folder1,
      folder2: record.folder2,
      folder3: record.folder3,
    })
    if (!folders.success) return folders as Result<never>
    const parsedAsset = v.safeParse(assetSchema, {
      id: record.id,
      projectId: record.projectId,
      class: record.class,
      folders: folders.data,
      filename: record.filename,
      basename: record.basename,
      currentSourceRevisionId: record.currentSourceRevisionId,
      ...(record.integrationNote === null ? {} : { integrationNote: record.integrationNote }),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })
    if (!parsedAsset.success) return resultErrorCreate("assetApiRepositoryAssetRead", "The stored asset was invalid")

    const sourceRecords = db
      .select()
      .from(sourceRevisionTable)
      .where(eq(sourceRevisionTable.assetId, record.id))
      .orderBy(asc(sourceRevisionTable.revision), asc(sourceRevisionTable.id))
      .all()
    const sourceHistory: Array<AssetDetail["sourceHistory"][number]> = []
    for (const sourceRecord of sourceRecords) {
      const source = v.safeParse(sourceRevisionSchema, sourceRecord)
      if (!source.success)
        return resultErrorCreate("assetApiRepositorySourceRead", "The stored source revision was invalid")
      sourceHistory.push(source.output)
    }

    const outputRecords = db
      .select()
      .from(outputDefinitionTable)
      .where(eq(outputDefinitionTable.assetId, record.id))
      .orderBy(asc(outputDefinitionTable.key), asc(outputDefinitionTable.id))
      .all()
    const outputHistory: AssetOutputHistory[] = []
    for (const outputRecord of outputRecords) {
      const definition = outputDefinitionRead(outputRecord)
      if (!definition.success) return definition as Result<never>
      const versionRecords = db
        .select()
        .from(outputVersionTable)
        .where(eq(outputVersionTable.outputDefinitionId, outputRecord.id))
        .orderBy(asc(outputVersionTable.version), asc(outputVersionTable.id))
        .all()
      const versions: Array<AssetOutputHistory["versions"][number]> = []
      for (const versionRecord of versionRecords) {
        const { width, height, ...versionRest } = versionRecord
        const version = v.safeParse(outputVersionSchema, {
          ...versionRest,
          ...(width === null ? {} : { width }),
          ...(height === null ? {} : { height }),
        })
        if (!version.success)
          return resultErrorCreate("assetApiRepositoryVersionRead", "The stored output version was invalid")
        versions.push(version.output)
      }
      outputHistory.push({ definition: definition.data, versions })
    }

    const metadataRecord = db.select().from(assetMetadataTable).where(eq(assetMetadataTable.assetId, record.id)).get()
    let metadata: AssetDetail["metadata"] = null
    if (metadataRecord !== undefined) {
      const parsedMetadata = v.safeParse(mediaMetadataSchema, metadataRecord.metadata)
      if (!parsedMetadata.success)
        return resultErrorCreate("assetApiRepositoryMetadataRead", "The stored metadata was invalid")
      const metadataSchema = v.safeParse(assetMetadataSchema, {
        id: metadataRecord.id,
        assetId: metadataRecord.assetId,
        sourceRevisionId: metadataRecord.sourceRevisionId,
        metadata: parsedMetadata.output,
        createdAt: metadataRecord.createdAt,
        updatedAt: metadataRecord.updatedAt,
      })
      if (!metadataSchema.success)
        return resultErrorCreate("assetApiRepositoryMetadataRead", "The stored metadata was invalid")
      metadata = metadataSchema.output
    }

    return {
      success: true,
      data: {
        ...parsedAsset.output,
        sourcePath: assetSourcePathCreate(parsedAsset.output.folders, parsedAsset.output.filename),
        sourceHistory,
        outputHistory,
        metadata,
      },
    }
  }

  const assetRead = (projectId: string, assetId: string): Result<AssetDetail | null> => {
    try {
      const record = db
        .select()
        .from(assetTable)
        .where(and(eq(assetTable.projectId, projectId), eq(assetTable.id, assetId)))
        .get()
      if (record === undefined) return { success: true, data: null }
      return assetRecordRead(record)
    } catch (error) {
      return resultErrorCreate("assetApiRepositoryAssetRead", "The asset could not be read", error)
    }
  }

  const assetsRead = (projectId: string, assetClass?: AssetClass) => {
    try {
      const records = db
        .select()
        .from(assetTable)
        .where(
          assetClass === undefined
            ? eq(assetTable.projectId, projectId)
            : and(eq(assetTable.projectId, projectId), eq(assetTable.class, assetClass)),
        )
        .orderBy(
          asc(assetTable.class),
          asc(assetTable.folder1),
          asc(assetTable.folder2),
          asc(assetTable.folder3),
          asc(assetTable.basename),
          asc(assetTable.id),
        )
        .all()
      const deletionStates = new Map(
        db
          .select({ assetId: deletionStateTable.assetId, status: deletionStateTable.status })
          .from(deletionStateTable)
          .all()
          .map((state) => [state.assetId, state.status] as const),
      )
      const assets = []
      for (const record of records) {
        const detail = assetRecordRead(record)
        if (!detail.success) return detail
        const deletionStatus = deletionStates.get(record.id)
        assets.push({
          id: detail.data.id,
          projectId: detail.data.projectId,
          class: detail.data.class,
          folders: detail.data.folders,
          filename: detail.data.filename,
          basename: detail.data.basename,
          currentSourceRevisionId: detail.data.currentSourceRevisionId,
          ...(detail.data.integrationNote === undefined ? {} : { integrationNote: detail.data.integrationNote }),
          createdAt: detail.data.createdAt,
          updatedAt: detail.data.updatedAt,
          sourcePath: detail.data.sourcePath,
          outputCount: detail.data.outputHistory.length,
          ...(deletionStatus === undefined ? {} : { deletionStatus }),
        })
      }
      return { success: true, data: assets } as const
    } catch (error) {
      return resultErrorCreate("assetApiRepositoryAssetsRead", "The assets could not be read", error)
    }
  }

  const assetOutputsRead = (
    projectId: string,
    assetId: string,
  ): Result<readonly import("../output/outputDefinitionSchema.js").OutputDefinition[] | null> => {
    const detail = assetRead(projectId, assetId)
    if (!detail.success) return detail
    return detail.success && detail.data
      ? { success: true, data: detail.data.outputHistory.map((history) => history.definition) }
      : { success: true, data: null }
  }

  const assetOutputAdd = (
    projectId: string,
    assetId: string,
    input: import("../api-client/outputDefinitionInputSchema.js").OutputDefinitionInput,
  ): Result<AssetApiMutation | null> => {
    const parsed = v.safeParse(outputDefinitionInputSchema, input)
    if (!parsed.success)
      return resultErrorCreate("assetApiRepositoryOutputAdd", "The output definition was invalid", parsed.issues)
    const current = db
      .select()
      .from(assetTable)
      .where(and(eq(assetTable.projectId, projectId), eq(assetTable.id, assetId)))
      .get()
    if (current === undefined) return { success: true, data: null }
    const definition = outputDefinitionRecordCreate(assetId, parsed.output, new Date().toISOString())
    if (!definition.success) return definition
    const existing = db
      .select()
      .from(outputDefinitionTable)
      .where(and(eq(outputDefinitionTable.assetId, assetId), eq(outputDefinitionTable.key, definition.data.key)))
      .get()
    if (existing !== undefined) {
      const existingDefinition = outputDefinitionRead(existing)
      if (!existingDefinition.success) return existingDefinition
      if (!outputDefinitionsEqual(definitionToInput(existing), parsed.output))
        return resultErrorCreate("assetApiRepositoryOutputAdd", "An output with this key already exists")
      return assetMutationRead(projectId, assetId, outputWorkflowIdCreate(assetId, "add", parsed.output))
    }
    if (parsed.output.kind !== current.class)
      return resultErrorCreate("assetApiRepositoryOutputAdd", "Output definition class does not match the asset class")
    if (
      current.class === "video" &&
      db.select().from(outputDefinitionTable).where(eq(outputDefinitionTable.assetId, assetId)).all().length > 0
    )
      return resultErrorCreate("assetApiRepositoryOutputAdd", "A video asset can have only one output")
    const inserted = databaseTransactionRun(db, (transaction) => {
      transaction.insert(outputDefinitionTable).values(definition.data).run()
      transaction
        .update(assetTable)
        .set({ updatedAt: definition.data.updatedAt })
        .where(eq(assetTable.id, assetId))
        .run()
      return { success: true, data: null } as const
    })
    if (!inserted.success) return inserted
    return assetMutationRead(projectId, assetId, outputWorkflowIdCreate(assetId, "add", parsed.output))
  }

  const assetOutputRemove = (
    projectId: string,
    assetId: string,
    outputKey: string,
  ): Result<AssetApiMutation | null> => {
    const parsedKey = v.safeParse(outputKeySchema, outputKey)
    if (!parsedKey.success)
      return resultErrorCreate("assetApiRepositoryOutputRemove", "The output key was invalid", parsedKey.issues)
    const current = db
      .select()
      .from(assetTable)
      .where(and(eq(assetTable.projectId, projectId), eq(assetTable.id, assetId)))
      .get()
    if (current === undefined) return { success: true, data: null }
    const definitions = db.select().from(outputDefinitionTable).where(eq(outputDefinitionTable.assetId, assetId)).all()
    const existing = definitions.find((definition) => definition.key === parsedKey.output)
    if (existing === undefined)
      return assetMutationRead(projectId, assetId, outputWorkflowIdCreate(assetId, "remove", parsedKey.output))
    if (current.class === "image" && definitions.length <= 1)
      return resultErrorCreate("assetApiRepositoryOutputRemove", "An image asset must retain at least one output")
    const removed = databaseTransactionRun(db, (transaction) => {
      transaction.delete(outputDefinitionTable).where(eq(outputDefinitionTable.id, existing.id)).run()
      transaction
        .update(assetTable)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(assetTable.id, assetId))
        .run()
      return { success: true, data: null } as const
    })
    if (!removed.success) return removed
    return assetMutationRead(projectId, assetId, outputWorkflowIdCreate(assetId, "remove", parsedKey.output))
  }

  const assetOutputsSet = (
    projectId: string,
    assetId: string,
    input: AssetOutputSetInput,
  ): Result<AssetApiMutation | null> => {
    const parsed = v.safeParse(outputSetRequestSchema, input)
    if (!parsed.success)
      return resultErrorCreate("assetApiRepositoryOutputsSet", "The output set was invalid", parsed.issues)
    const current = db
      .select()
      .from(assetTable)
      .where(and(eq(assetTable.projectId, projectId), eq(assetTable.id, assetId)))
      .get()
    if (current === undefined) return { success: true, data: null }
    if (parsed.output.outputs.some((output) => output.kind !== current.class))
      return resultErrorCreate("assetApiRepositoryOutputsSet", "Output definition class does not match the asset class")
    if (current.class === "video" && parsed.output.outputs.length !== 1)
      return resultErrorCreate("assetApiRepositoryOutputsSet", "A video asset must have exactly one output")
    const keys = parsed.output.outputs.map((output) => output.key)
    if (new Set(keys).size !== keys.length)
      return resultErrorCreate("assetApiRepositoryOutputsSet", "Output keys must be unique")
    const existing = db.select().from(outputDefinitionTable).where(eq(outputDefinitionTable.assetId, assetId)).all()
    if (
      existing.length === parsed.output.outputs.length &&
      existing.every((definition) =>
        parsed.output.outputs.some((output) => outputDefinitionsEqual(definitionToInput(definition), output)),
      )
    )
      return assetMutationRead(projectId, assetId, outputWorkflowIdCreate(assetId, "set", parsed.output.outputs))

    const now = new Date().toISOString()
    const records = parsed.output.outputs.map((output) => outputDefinitionRecordCreate(assetId, output, now))
    const invalid = records.find((record) => !record.success)
    if (invalid && !invalid.success) return invalid
    const insertedRecords = records.map((record) => (record.success ? record.data : undefined))
    if (insertedRecords.some((record) => record === undefined))
      return resultErrorCreate("assetApiRepositoryOutputsSet", "The output set was invalid")
    const replaced = databaseTransactionRun(db, (transaction) => {
      transaction.delete(outputDefinitionTable).where(eq(outputDefinitionTable.assetId, assetId)).run()
      for (const record of insertedRecords) {
        if (record === undefined) return resultErrorCreate("assetApiRepositoryOutputsSet", "The output set was invalid")
        transaction.insert(outputDefinitionTable).values(record).run()
      }
      transaction.update(assetTable).set({ updatedAt: now }).where(eq(assetTable.id, assetId)).run()
      return { success: true, data: null } as const
    })
    if (!replaced.success) return replaced
    return assetMutationRead(projectId, assetId, outputWorkflowIdCreate(assetId, "set", parsed.output.outputs))
  }

  const assetMetadataSet = (projectId: string, assetId: string, alt: string): Result<AssetApiMutation | null> =>
    assetMetadataChange(projectId, assetId, alt)

  const assetMetadataUnset = (projectId: string, assetId: string, field: "alt"): Result<AssetApiMutation | null> => {
    if (field !== "alt") return resultErrorCreate("assetApiRepositoryMetadataUnset", "The metadata field was invalid")
    return assetMetadataChange(projectId, assetId, null)
  }

  const assetMove = (
    projectId: string,
    assetId: string,
    input: AssetMoveInput,
  ): Result<import("./assetSchema.js").Asset | null> => {
    const folders = v.safeParse(foldersSchema, input.folders)
    if (!folders.success) return resultErrorCreate("assetApiRepositoryMove", "The move folders were invalid")
    const filename = v.safeParse(assetFilenameSchema, input.filename)
    if (!filename.success) return resultErrorCreate("assetApiRepositoryMove", "The move filename was invalid")
    const columns = foldersDatabaseColumnsCreate(folders.output)
    if (!columns.success) return columns
    try {
      const current = db
        .select()
        .from(assetTable)
        .where(and(eq(assetTable.projectId, projectId), eq(assetTable.id, assetId)))
        .get()
      if (current === undefined) return { success: true, data: null }
      if (
        current.folder1 === columns.data.folder1 &&
        current.folder2 === columns.data.folder2 &&
        current.folder3 === columns.data.folder3 &&
        current.filename === filename.output
      ) {
        const unchanged = v.safeParse(assetSchema, {
          id: current.id,
          projectId: current.projectId,
          class: current.class,
          folders: folders.output,
          filename: current.filename,
          basename: current.basename,
          currentSourceRevisionId: current.currentSourceRevisionId,
          ...(current.integrationNote === null ? {} : { integrationNote: current.integrationNote }),
          createdAt: current.createdAt,
          updatedAt: current.updatedAt,
        })
        if (!unchanged.success) return resultErrorCreate("assetApiRepositoryMove", "The moved asset was invalid")
        return { success: true, data: unchanged.output }
      }
      const updated = db
        .update(assetTable)
        .set({
          ...columns.data,
          filename: filename.output,
          basename: assetBasenameCreate(filename.output),
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(assetTable.projectId, projectId), eq(assetTable.id, assetId)))
        .returning()
        .get()
      if (updated === undefined)
        return resultErrorCreate("assetApiRepositoryMove", "The asset disappeared during the move")
      const parsed = v.safeParse(assetSchema, {
        id: updated.id,
        projectId: updated.projectId,
        class: updated.class,
        folders: folders.output,
        filename: updated.filename,
        basename: updated.basename,
        currentSourceRevisionId: updated.currentSourceRevisionId,
        ...(updated.integrationNote === null ? {} : { integrationNote: updated.integrationNote }),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      })
      if (!parsed.success) return resultErrorCreate("assetApiRepositoryMove", "The moved asset was invalid")
      const workflow = assetProcessingWorkflowEnqueue(db, {
        projectId,
        assetId,
        workflowId: outputWorkflowIdCreate(assetId, "move", {
          folders: folders.output,
          filename: filename.output,
        }),
        forceNewVersion: true,
      })
      if (!workflow.success) return workflow
      return { success: true, data: parsed.output }
    } catch (error) {
      return resultErrorCreate("assetApiRepositoryMove", "The asset path is already in use", error)
    }
  }

  return {
    assetsRead,
    assetRead,
    assetOutputAdd,
    assetOutputRemove,
    assetOutputsRead,
    assetOutputsSet,
    assetMetadataSet,
    assetMetadataUnset,
    assetMove,
  }

  function assetMetadataChange(
    projectIdentifier: string,
    identifier: string,
    alt: string | null,
  ): Result<AssetApiMutation | null> {
    const detail = assetRead(projectIdentifier, identifier)
    if (!detail.success) return detail
    if (detail.data === null) return { success: true, data: null }
    if (detail.data.metadata === null)
      return resultErrorCreate("assetApiRepositoryMetadataSet", "Asset metadata is not available")
    if (detail.data.metadata.metadata.kind !== "image")
      return resultErrorCreate("assetApiRepositoryMetadataSet", "The metadata field is not valid for this asset class")
    if (detail.data.metadata.metadata.alt === alt) return { success: true, data: { asset: detail.data } }
    const metadata = { ...detail.data.metadata.metadata, alt }
    const parsedMetadata = v.safeParse(mediaMetadataSchema, metadata)
    if (!parsedMetadata.success)
      return resultErrorCreate("assetApiRepositoryMetadataSet", "The metadata value was invalid", parsedMetadata.issues)
    const now = new Date().toISOString()
    const updated = databaseTransactionRun(db, (transaction) => {
      transaction
        .update(assetMetadataTable)
        .set({ metadata: parsedMetadata.output, updatedAt: now })
        .where(eq(assetMetadataTable.assetId, identifier))
        .run()
      transaction.update(assetTable).set({ updatedAt: now }).where(eq(assetTable.id, identifier)).run()
      return { success: true, data: null } as const
    })
    if (!updated.success) return updated
    return assetMutationRead(projectIdentifier, identifier)
  }

  function assetMutationRead(
    projectIdentifier: string,
    identifier: string,
    workflowId?: string,
  ): Result<AssetApiMutation | null> {
    const detail = assetRead(projectIdentifier, identifier)
    if (!detail.success) return detail
    if (detail.data === null) return { success: true, data: null }
    if (workflowId === undefined) return { success: true, data: { asset: detail.data } }
    const enqueued = assetProcessingWorkflowEnqueue(db, {
      projectId: projectIdentifier,
      assetId: identifier,
      workflowId,
    })
    if (!enqueued.success) return enqueued
    return { success: true, data: { asset: detail.data, workflowId: enqueued.data.workflowId } }
  }
}

const outputDefinitionRead = (
  record: typeof outputDefinitionTable.$inferSelect,
): Result<import("../output/outputDefinitionSchema.js").OutputDefinition> => {
  const value = {
    id: record.id,
    assetId: record.assetId,
    kind: record.kind,
    key: record.key,
    ...(record.width === null ? {} : { width: record.width }),
    ...(record.height === null ? {} : { height: record.height }),
    ...(record.format === null ? {} : { format: record.format }),
    ...(record.quality === null ? {} : { quality: record.quality }),
    ...(record.showAiLabel === null ? {} : { showAiLabel: record.showAiLabel }),
  }
  const parsed = v.safeParse(outputDefinitionSchema, value)
  if (!parsed.success)
    return resultErrorCreate("assetApiRepositoryOutputRead", "The stored output definition was invalid")
  return { success: true, data: parsed.output }
}

function outputDefinitionRecordCreate(
  assetId: string,
  input: import("../api-client/outputDefinitionInputSchema.js").OutputDefinitionInput,
  now: string,
): Result<typeof outputDefinitionTable.$inferInsert> {
  const parsed = v.safeParse(outputDefinitionInputSchema, input)
  if (!parsed.success)
    return resultErrorCreate("assetApiRepositoryOutputCreate", "The output definition was invalid", parsed.issues)
  const id = `output-${canonicalJsonDigest({ assetId, output: parsed.output })}`
  if (parsed.output.kind === "image") {
    return {
      success: true,
      data: {
        id,
        assetId,
        kind: "image",
        key: parsed.output.key,
        width: parsed.output.width,
        height: parsed.output.height,
        format: parsed.output.format,
        quality: parsed.output.quality ?? null,
        showAiLabel: parsed.output.showAiLabel ?? null,
        createdAt: now,
        updatedAt: now,
      },
    }
  }
  if (parsed.output.kind === "video") {
    return {
      success: true,
      data: {
        id,
        assetId,
        kind: "video",
        key: parsed.output.key,
        width: null,
        height: null,
        format: null,
        quality: null,
        showAiLabel: null,
        createdAt: now,
        updatedAt: now,
      },
    }
  }
  if (parsed.output.kind === "document") {
    return {
      success: true,
      data: {
        id,
        assetId,
        kind: "document",
        key: "default",
        width: null,
        height: null,
        format: null,
        quality: null,
        showAiLabel: null,
        createdAt: now,
        updatedAt: now,
      },
    }
  }
  return {
    success: true,
    data: {
      id,
      assetId,
      kind: "font",
      key: parsed.output.key,
      width: null,
      height: null,
      format: parsed.output.format,
      quality: null,
      showAiLabel: null,
      createdAt: now,
      updatedAt: now,
    },
  }
}

function outputDefinitionsEqual(
  left: import("../api-client/outputDefinitionInputSchema.js").OutputDefinitionInput,
  right: import("../api-client/outputDefinitionInputSchema.js").OutputDefinitionInput,
): boolean {
  return canonicalJsonDigest(left) === canonicalJsonDigest(right)
}

function definitionToInput(
  definition: typeof outputDefinitionTable.$inferSelect,
): import("../api-client/outputDefinitionInputSchema.js").OutputDefinitionInput {
  if (definition.kind === "image") {
    return {
      kind: "image",
      key: definition.key,
      width: definition.width ?? 0,
      height: definition.height ?? 0,
      format: definition.format as "jpg" | "png" | "webp" | "avif",
      ...(definition.quality === null ? {} : { quality: definition.quality }),
      ...(definition.showAiLabel === null ? {} : { showAiLabel: definition.showAiLabel }),
    }
  }
  if (definition.kind === "video") return { kind: "video", key: definition.key }
  if (definition.kind === "document") return { kind: "document", key: "default" }
  return { kind: "font", key: definition.key, format: definition.format as "woff2" }
}

function outputWorkflowIdCreate(assetId: string, operation: string, input?: unknown): string {
  return `workflow-output-${canonicalJsonDigest({ assetId, operation, input })}`
}
