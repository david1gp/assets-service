import { and, asc, desc, eq, inArray } from "drizzle-orm"
import * as v from "valibot"

import { foldersDatabaseColumnsRead } from "../asset/foldersDatabaseColumnsRead.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { assetMetadataTable } from "../infrastructure/db/schema/assetMetadataTable.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { catalogGenerationTable } from "../infrastructure/db/schema/catalogGenerationTable.js"
import { catalogOutputTable } from "../infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../infrastructure/db/schema/catalogTable.js"
import { manifestTable } from "../infrastructure/db/schema/manifestTable.js"
import { outputVersionTable } from "../infrastructure/db/schema/outputVersionTable.js"
import { mediaMetadataSchema } from "../metadata/mediaMetadataSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { CatalogApiRepository } from "./catalogApiRepository.js"
import { catalogListsRender } from "./catalogListsRender.js"
import { catalogOutputSchema } from "./catalogOutputSchema.js"
import { catalogSchema } from "./catalogSchema.js"
import { manifestSchema } from "./manifestSchema.js"

const pageLimitRead = (limit: number | undefined): number => Math.min(100, Math.max(1, limit ?? 50))

export const catalogApiRepositoryCreate = (db: AssetDatabase): CatalogApiRepository => {
  const outputsRead = (generationId: string): Result<readonly import("./catalogOutputSchema.js").CatalogOutput[]> => {
    const rows = db
      .select()
      .from(catalogOutputTable)
      .where(eq(catalogOutputTable.generationId, generationId))
      .orderBy(asc(catalogOutputTable.property), asc(catalogOutputTable.outputVersionId))
      .all()
    const assetIds = [...new Set(rows.map((row) => row.assetId))]
    const metadataByAssetId = new Map(
      assetIds.length === 0
        ? []
        : db
            .select({ assetId: assetMetadataTable.assetId, metadata: assetMetadataTable.metadata })
            .from(assetMetadataTable)
            .where(inArray(assetMetadataTable.assetId, assetIds))
            .all()
            .map((row) => [row.assetId, row.metadata] as const),
    )
    const outputs: import("./catalogOutputSchema.js").CatalogOutput[] = []
    for (const row of rows) {
      const assetMetadata = metadataByAssetId.get(row.assetId)
      const metadata =
        assetMetadata?.kind === "image" && row.metadata.kind === "image"
          ? { ...row.metadata, alt: assetMetadata.alt }
          : row.metadata
      const { generationId: _generationId, ...output } = { ...row, metadata }
      const parsed = v.safeParse(catalogOutputSchema, output)
      if (!parsed.success)
        return resultErrorCreate("catalogApiRepositoryOutputRead", "The stored catalog output was invalid")
      outputs.push(parsed.output)
    }
    return { success: true, data: outputs }
  }

  const snapshotRead = (generation: typeof catalogGenerationTable.$inferSelect, id: string, current: boolean) => {
    const outputs = outputsRead(generation.id)
    if (!outputs.success) return outputs
    const parsed = v.safeParse(catalogSchema, {
      schema: "assets.catalog.v1",
      projectId: generation.projectId,
      environment: generation.environment,
      digest: generation.digest,
      rendererVersion: generation.rendererVersion,
      generatedAt: generation.createdAt,
      outputs: outputs.data,
    })
    if (!parsed.success) return resultErrorCreate("catalogApiRepositorySnapshotRead", "The stored catalog was invalid")
    return { success: true, data: { id, generationId: generation.id, current, catalog: parsed.output } } as const
  }

  const generationRead = (projectId: string, generationId: string) =>
    db
      .select()
      .from(catalogGenerationTable)
      .where(and(eq(catalogGenerationTable.projectId, projectId), eq(catalogGenerationTable.id, generationId)))
      .get()

  const catalogCurrentRead: CatalogApiRepository["catalogCurrentRead"] = (projectId, environment) => {
    try {
      const current = db
        .select()
        .from(catalogTable)
        .where(and(eq(catalogTable.projectId, projectId), eq(catalogTable.environment, environment)))
        .get()
      if (current === undefined) return { success: true, data: null }
      const generation = generationRead(projectId, current.generationId)
      if (generation === undefined)
        return resultErrorCreate("catalogApiRepositoryCurrentRead", "The catalog generation was not found")
      return snapshotRead(generation, current.id, true)
    } catch (error) {
      return resultErrorCreate("catalogApiRepositoryCurrentRead", "The current catalog could not be read", error)
    }
  }

  const catalogRead: CatalogApiRepository["catalogRead"] = (projectId, generationId) => {
    try {
      const generation = generationRead(projectId, generationId)
      if (generation === undefined) return { success: true, data: null }
      const current = db
        .select({ id: catalogTable.id })
        .from(catalogTable)
        .where(eq(catalogTable.generationId, generationId))
        .get()
      return snapshotRead(generation, current?.id ?? generation.id, current !== undefined)
    } catch (error) {
      return resultErrorCreate("catalogApiRepositoryRead", "The catalog could not be read", error)
    }
  }

  const catalogsRead: CatalogApiRepository["catalogsRead"] = (projectId, environment, options) => {
    try {
      const generations = db
        .select()
        .from(catalogGenerationTable)
        .where(
          and(eq(catalogGenerationTable.projectId, projectId), eq(catalogGenerationTable.environment, environment)),
        )
        .orderBy(desc(catalogGenerationTable.createdAt), desc(catalogGenerationTable.id))
        .all()
      const currentIds = new Map(
        db
          .select({ generationId: catalogTable.generationId, id: catalogTable.id })
          .from(catalogTable)
          .where(and(eq(catalogTable.projectId, projectId), eq(catalogTable.environment, environment)))
          .all()
          .map((record) => [record.generationId, record.id] as const),
      )
      const offset = options.cursor ?? 0
      const limit = pageLimitRead(options.limit)
      const selected = generations.slice(offset, offset + limit + 1)
      const items = []
      for (const generation of selected.slice(0, limit)) {
        const currentId = currentIds.get(generation.id)
        const snapshot = snapshotRead(generation, currentId ?? generation.id, currentId !== undefined)
        if (!snapshot.success) return snapshot
        items.push(snapshot.data)
      }
      return { success: true, data: { items, nextCursor: selected.length > limit ? offset + limit : null } }
    } catch (error) {
      return resultErrorCreate("catalogApiRepositoryCatalogsRead", "The catalog history could not be read", error)
    }
  }

  const catalogListsRead: CatalogApiRepository["catalogListsRead"] = (projectId, environment, options) => {
    const selected = options.generationId
      ? catalogRead(projectId, options.generationId)
      : catalogCurrentRead(projectId, environment)
    if (!selected.success) return selected
    if (selected.data === null) return { success: true, data: null }
    const entries: unknown[] = []
    for (const output of selected.data.catalog.outputs) {
      const asset = db.select().from(assetTable).where(eq(assetTable.id, output.assetId)).get()
      const version = db
        .select()
        .from(outputVersionTable)
        .where(eq(outputVersionTable.id, output.outputVersionId))
        .get()
      if (asset === undefined || version === undefined)
        return resultErrorCreate("catalogApiRepositoryListsRead", "The catalog output was incomplete")
      const folders = foldersDatabaseColumnsRead({
        folder1: asset.folder1,
        folder2: asset.folder2,
        folder3: asset.folder3,
      })
      if (!folders.success) return folders
      const metadata = v.safeParse(mediaMetadataSchema, output.metadata)
      if (!metadata.success)
        return resultErrorCreate("catalogApiRepositoryListsRead", "The catalog metadata was invalid")
      entries.push({
        class: output.class,
        folders: folders.data,
        basename: asset.basename,
        key: output.key,
        path: output.path,
        mediaType: version.mediaType,
        metadata: metadata.output,
      })
    }
    return catalogListsRender(entries)
  }

  const manifestsRead: CatalogApiRepository["manifestsRead"] = (projectId, options) => {
    try {
      const conditions = [eq(manifestTable.projectId, projectId)]
      if (options.assetId !== undefined) conditions.push(eq(manifestTable.assetId, options.assetId))
      if (options.generationId !== undefined)
        conditions.push(eq(manifestTable.catalogGenerationId, options.generationId))
      if (options.kind !== undefined) conditions.push(eq(manifestTable.kind, options.kind))
      const rows = db
        .select()
        .from(manifestTable)
        .where(and(...conditions))
        .orderBy(desc(manifestTable.createdAt), asc(manifestTable.id))
        .all()
      const offset = options.cursor ?? 0
      const limit = pageLimitRead(options.limit)
      const selected = rows.slice(offset, offset + limit + 1)
      const items: import("./manifestSchema.js").Manifest[] = []
      for (const row of selected.slice(0, limit)) {
        const parsed = v.safeParse(manifestSchema, row)
        if (!parsed.success)
          return resultErrorCreate("catalogApiRepositoryManifestsRead", "The stored manifest was invalid")
        items.push(parsed.output)
      }
      return { success: true, data: { items, nextCursor: selected.length > limit ? offset + limit : null } }
    } catch (error) {
      return resultErrorCreate("catalogApiRepositoryManifestsRead", "The manifests could not be read", error)
    }
  }

  const manifestRead: CatalogApiRepository["manifestRead"] = (projectId, manifestId) => {
    try {
      const row = db
        .select()
        .from(manifestTable)
        .where(and(eq(manifestTable.projectId, projectId), eq(manifestTable.id, manifestId)))
        .get()
      if (row === undefined) return { success: true, data: null }
      const parsed = v.safeParse(manifestSchema, row)
      if (!parsed.success)
        return resultErrorCreate("catalogApiRepositoryManifestRead", "The stored manifest was invalid")
      return { success: true, data: parsed.output }
    } catch (error) {
      return resultErrorCreate("catalogApiRepositoryManifestRead", "The manifest could not be read", error)
    }
  }

  return { catalogCurrentRead, catalogsRead, catalogRead, catalogListsRead, manifestsRead, manifestRead }
}
