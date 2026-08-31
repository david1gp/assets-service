import { and, asc, desc, eq } from "drizzle-orm"
import * as v from "valibot"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { assetMetadataTable } from "../infrastructure/db/schema/assetMetadataTable.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { blobTable } from "../infrastructure/db/schema/blobTable.js"
import { catalogGenerationTable } from "../infrastructure/db/schema/catalogGenerationTable.js"
import { catalogOutputTable } from "../infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../infrastructure/db/schema/catalogTable.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { manifestTable } from "../infrastructure/db/schema/manifestTable.js"
import { outputDefinitionTable } from "../infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../infrastructure/db/schema/outputVersionTable.js"
import { mediaMetadataSchema } from "../metadata/mediaMetadataSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import { storageBindingResolve } from "../storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import { storageObjectVerify } from "../storage/storageObjectVerify.js"
import { storagePutImmutable } from "../storage/storagePutImmutable.js"
import { jobPayloadSchema } from "../workflow/jobPayloadSchema.js"
import { canonicalJsonDigest } from "./canonicalJsonDigest.js"
import { canonicalJsonStringify } from "./canonicalJsonStringify.js"
import { catalogEntryPropertyCreate } from "./catalogEntryPropertyCreate.js"
import type { CatalogPublicationService } from "./catalogPublicationService.js"
import { catalogSchema } from "./catalogSchema.js"

const rendererVersion = "assets-service.catalog.v1"
const maxPublicationAttempts = 3

type PublicationContext = Parameters<CatalogPublicationService["catalogAssetPublish"]>[0]
type PublishedOutput = Parameters<CatalogPublicationService["catalogAssetPublish"]>[1][number]
type PublicationResult =
  Awaited<ReturnType<CatalogPublicationService["catalogAssetPublish"]>> extends Result<infer T> ? T : never
type CatalogOutput = typeof catalogOutputTable.$inferInsert
type PublicationSnapshot = {
  catalogId: string
  generationId: string | null
  previousOutputs: readonly (typeof catalogOutputTable.$inferSelect)[]
  currentVersionIds?: readonly string[]
}
type RebuildOutput = {
  asset: typeof assetTable.$inferSelect
  definition: typeof outputDefinitionTable.$inferSelect
  version: typeof outputVersionTable.$inferSelect
  metadata: v.InferOutput<typeof mediaMetadataSchema>
}
type RebuildSnapshot = PublicationSnapshot & {
  environment: typeof environmentTable.$inferSelect
  currentVersionIds: readonly string[]
  outputs: readonly RebuildOutput[]
}
type PreparedPublication = {
  snapshot: PublicationSnapshot
  generationId: string
  digest: string
  manifestObjectKey: string
  generatedAt: string
  manifestBytes: Uint8Array
  manifestSha256: string
  canonicalOutputs: readonly CatalogOutput[]
  result: PublicationResult
}

export const catalogPublicationServiceCreate = (
  db: AssetDatabase,
  storage: StorageAdapter,
): CatalogPublicationService => {
  const catalogSnapshotRead = (projectId: string, environment: "development" | "production") =>
    databaseTransactionRun<PublicationSnapshot>(
      db,
      (transaction) => {
        const catalog = transaction
          .select()
          .from(catalogTable)
          .where(and(eq(catalogTable.projectId, projectId), eq(catalogTable.environment, environment)))
          .get()
        if (catalog === undefined) {
          return {
            success: true,
            data: {
              catalogId: `catalog-${projectId}-${environment}`,
              generationId: null,
              previousOutputs: [],
            },
          }
        }
        const generation = transaction
          .select({ id: catalogGenerationTable.id })
          .from(catalogGenerationTable)
          .where(eq(catalogGenerationTable.id, catalog.generationId))
          .get()
        if (generation === undefined)
          return resultErrorCreate("catalogPublicationSnapshotRead", "Catalog generation not found")
        return {
          success: true,
          data: {
            catalogId: catalog.id,
            generationId: catalog.generationId,
            previousOutputs: transaction
              .select()
              .from(catalogOutputTable)
              .where(eq(catalogOutputTable.generationId, generation.id))
              .all(),
          },
        }
      },
      { behavior: "immediate" },
    )

  const catalogMetadataByVersionRead = (
    transaction: AssetDatabase,
    projectId: string,
  ): Map<string, v.InferOutput<typeof mediaMetadataSchema>> => {
    const generations = transaction
      .select({ id: catalogGenerationTable.id })
      .from(catalogGenerationTable)
      .where(eq(catalogGenerationTable.projectId, projectId))
      .orderBy(desc(catalogGenerationTable.createdAt), desc(catalogGenerationTable.id))
      .all()
    const metadataByVersionId = new Map<string, v.InferOutput<typeof mediaMetadataSchema>>()
    for (const generation of generations) {
      const outputs = transaction
        .select({ outputVersionId: catalogOutputTable.outputVersionId, metadata: catalogOutputTable.metadata })
        .from(catalogOutputTable)
        .where(eq(catalogOutputTable.generationId, generation.id))
        .all()
      for (const output of outputs) {
        if (!metadataByVersionId.has(output.outputVersionId))
          metadataByVersionId.set(output.outputVersionId, output.metadata)
      }
    }
    return metadataByVersionId
  }

  const jobMetadataByVersionRead = (
    transaction: AssetDatabase,
  ): Map<string, v.InferOutput<typeof mediaMetadataSchema>> => {
    const metadataByVersionId = new Map<string, v.InferOutput<typeof mediaMetadataSchema>>()
    for (const job of transaction.select({ payload: jobTable.payload }).from(jobTable).all()) {
      const parsedPayload = v.safeParse(jobPayloadSchema, job.payload)
      if (!parsedPayload.success || parsedPayload.output.values === undefined) continue
      const outputVersionId = parsedPayload.output.values.outputVersionId
      const metadata = parsedPayload.output.values.metadata
      if (typeof outputVersionId !== "string") continue
      const parsedMetadata = v.safeParse(mediaMetadataSchema, metadata)
      if (parsedMetadata.success) metadataByVersionId.set(outputVersionId, parsedMetadata.output)
    }
    return metadataByVersionId
  }

  const sourceMetadataRead = (
    transaction: AssetDatabase,
    assetId: string,
  ): v.InferOutput<typeof mediaMetadataSchema> | undefined => {
    const metadata = transaction
      .select({ metadata: assetMetadataTable.metadata })
      .from(assetMetadataTable)
      .where(eq(assetMetadataTable.assetId, assetId))
      .get()
    return metadata?.metadata
  }

  const outputMetadataFallbackCreate = (
    asset: typeof assetTable.$inferSelect,
    definition: typeof outputDefinitionTable.$inferSelect,
    version: typeof outputVersionTable.$inferSelect,
    sourceMetadata: v.InferOutput<typeof mediaMetadataSchema> | undefined,
  ): Result<v.InferOutput<typeof mediaMetadataSchema>> => {
    const source = sourceMetadata
    if (asset.class === "image") {
      const format = version.extension === "jpeg" ? "jpg" : version.extension
      const fallback = {
        kind: "image" as const,
        width: version.width ?? (source?.kind === "image" ? source.width : 1),
        height: version.height ?? (source?.kind === "image" ? source.height : 1),
        format,
        colorSpace: source?.kind === "image" ? source.colorSpace : "srgb",
        alpha: source?.kind === "image" ? source.alpha : false,
        orientationApplied: source?.kind === "image" ? source.orientationApplied : true,
        frameCount: source?.kind === "image" ? source.frameCount : 1,
        animated: source?.kind === "image" ? source.animated : false,
        alt: source?.kind === "image" ? source.alt : null,
        aiProvenance: source?.kind === "image" ? source.aiProvenance : null,
        ...(definition.showAiLabel === undefined
          ? source?.kind === "image" && source.showAiLabel !== undefined
            ? { showAiLabel: source.showAiLabel }
            : {}
          : { showAiLabel: definition.showAiLabel }),
      }
      const parsed = v.safeParse(mediaMetadataSchema, fallback)
      if (parsed.success) return { success: true, data: parsed.output }
    }
    if (asset.class === "video") {
      const fallback =
        source?.kind === "video"
          ? { ...source, width: version.width ?? source.width, height: version.height ?? source.height }
          : {
              kind: "video" as const,
              width: version.width ?? 1,
              height: version.height ?? 1,
              durationSeconds: 0,
              frameRate: 0,
              container: version.extension,
              videoCodec: "unknown",
              audioCodec: null,
              streams: 1,
              bitrate: null,
            }
      const parsed = v.safeParse(mediaMetadataSchema, fallback)
      if (parsed.success) return { success: true, data: parsed.output }
    }
    if (asset.class === "font") {
      const fallback =
        source?.kind === "font"
          ? { ...source, format: version.extension }
          : {
              kind: "font" as const,
              family: asset.basename,
              style: "normal",
              weight: 400,
              width: 5,
              variableAxes: [],
              glyphCount: 0,
              unicodeRanges: [],
              format: version.extension,
            }
      const parsed = v.safeParse(mediaMetadataSchema, fallback)
      if (parsed.success) return { success: true, data: parsed.output }
    }
    if (asset.class === "document") {
      const fallback = { kind: "document" as const, extension: version.extension, mediaType: version.mediaType }
      const parsed = v.safeParse(mediaMetadataSchema, fallback)
      if (parsed.success) return { success: true, data: parsed.output }
    }
    return resultErrorCreate(
      "catalogProductionRebuild",
      `Metadata for output version ${version.id} was invalid or unavailable`,
    )
  }

  const rebuildSnapshotRead = (projectId: string): Result<RebuildSnapshot> =>
    databaseTransactionRun<RebuildSnapshot>(
      db,
      (transaction) => {
        const environment = transaction
          .select()
          .from(environmentTable)
          .where(and(eq(environmentTable.projectId, projectId), eq(environmentTable.name, "production")))
          .get()
        if (environment === undefined)
          return resultErrorCreate("catalogProductionRebuild", "The production environment was not found")

        const catalog = transaction
          .select()
          .from(catalogTable)
          .where(and(eq(catalogTable.projectId, projectId), eq(catalogTable.environment, "production")))
          .get()
        const generation =
          catalog === undefined
            ? undefined
            : transaction
                .select({ id: catalogGenerationTable.id })
                .from(catalogGenerationTable)
                .where(eq(catalogGenerationTable.id, catalog.generationId))
                .get()
        if (catalog !== undefined && generation === undefined)
          return resultErrorCreate("catalogProductionRebuild", "The current catalog generation was not found")

        const versions = transaction
          .select()
          .from(outputVersionTable)
          .where(and(eq(outputVersionTable.projectId, projectId), eq(outputVersionTable.current, true)))
          .orderBy(
            asc(outputVersionTable.assetId),
            asc(outputVersionTable.outputDefinitionId),
            asc(outputVersionTable.id),
          )
          .all()
        const catalogMetadataByVersionId = catalogMetadataByVersionRead(transaction, projectId)
        const jobMetadataByVersionId = jobMetadataByVersionRead(transaction)
        const outputs: RebuildOutput[] = []
        for (const version of versions) {
          const asset = transaction
            .select()
            .from(assetTable)
            .where(and(eq(assetTable.projectId, projectId), eq(assetTable.id, version.assetId)))
            .get()
          const definition = transaction
            .select()
            .from(outputDefinitionTable)
            .where(eq(outputDefinitionTable.id, version.outputDefinitionId))
            .get()
          if (asset === undefined || definition === undefined || definition.assetId !== asset.id)
            return resultErrorCreate("catalogProductionRebuild", `Current output version ${version.id} was incomplete`)
          const storedMetadata = catalogMetadataByVersionId.get(version.id) ?? jobMetadataByVersionId.get(version.id)
          const metadata =
            storedMetadata === undefined
              ? outputMetadataFallbackCreate(asset, definition, version, sourceMetadataRead(transaction, asset.id))
              : { success: true as const, data: storedMetadata }
          if (!metadata.success) return metadata
          outputs.push({ asset, definition, version, metadata: metadata.data })
        }
        return {
          success: true,
          data: {
            catalogId: catalog?.id ?? `catalog-${projectId}-production`,
            environment,
            generationId: catalog?.generationId ?? null,
            previousOutputs:
              generation === undefined
                ? []
                : transaction
                    .select()
                    .from(catalogOutputTable)
                    .where(eq(catalogOutputTable.generationId, generation.id))
                    .all(),
            currentVersionIds: versions.map((version) => version.id),
            outputs,
          },
        }
      },
      { behavior: "immediate" },
    )

  const publicationPrepare = (
    snapshot: PublicationSnapshot,
    projectId: string,
    environment: "development" | "production",
    binding: PublicationContext["binding"],
    nextOutputs: readonly CatalogOutput[],
    now: Date,
    proposedGenerationPrefix: string,
  ): Result<PreparedPublication> => {
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
          eq(catalogGenerationTable.projectId, projectId),
          eq(catalogGenerationTable.environment, environment),
          eq(catalogGenerationTable.digest, digest),
        ),
      )
      .get()
    const generationId = existingGeneration?.id ?? `${proposedGenerationPrefix}-${digest}`
    const generatedAt = existingGeneration?.createdAt ?? now.toISOString()
    const manifestObjectKey = existingGeneration?.manifestObjectKey ?? `catalogs/${environment}/${digest}.json`
    const parsedManifest = v.safeParse(catalogSchema, {
      schema: "assets.catalog.v1",
      projectId,
      environment,
      digest,
      rendererVersion,
      generatedAt,
      outputs: manifestOutputs,
    })
    if (!parsedManifest.success)
      return resultErrorCreate(
        "catalogPublicationPrepare",
        "Canonical catalog manifest is invalid",
        parsedManifest.issues,
      )
    const manifestBytes = new TextEncoder().encode(canonicalJsonStringify(parsedManifest.output))
    const manifestSha256 = new Bun.CryptoHasher("sha256").update(manifestBytes).digest("hex")
    const manifestLocation = storageObjectLocationCreate(binding, "private-source", manifestObjectKey)
    if (!manifestLocation.success) return manifestLocation
    return {
      success: true,
      data: {
        snapshot,
        generationId,
        digest,
        manifestObjectKey,
        generatedAt,
        manifestBytes,
        manifestSha256,
        canonicalOutputs: canonicalOutputsForDigest.map((output) => ({ ...output, generationId })),
        result: {
          id: snapshot.catalogId,
          generationId,
          current: true,
          catalog: parsedManifest.output,
        },
      },
    }
  }

  const storageObjectPutEnsure = async (
    location: Parameters<StorageAdapter["putImmutable"]>[0]["location"],
    bytes: Uint8Array,
    mediaType: string,
    sha256: string,
  ): Promise<Result<true>> => {
    const existing = await storageObjectVerify(storage, { location, byteSize: bytes.byteLength, sha256, mediaType })
    if (existing.success) return { success: true, data: true }
    const stored = await storagePutImmutable(storage, { location, bytes, mediaType, sha256 })
    if (stored.success) return { success: true, data: true }
    const raced = await storageObjectVerify(storage, { location, byteSize: bytes.byteLength, sha256, mediaType })
    return raced.success ? { success: true, data: true } : stored
  }

  const blobRepositoryEnsure = (transaction: AssetDatabase, blob: typeof blobTable.$inferInsert): Result<null> => {
    const existing = transaction.select().from(blobTable).where(eq(blobTable.id, blob.id)).get()
    if (existing !== undefined) {
      if (
        existing.projectId !== blob.projectId ||
        existing.objectKey !== blob.objectKey ||
        existing.byteSize !== blob.byteSize ||
        existing.sha256 !== blob.sha256 ||
        existing.mediaType !== blob.mediaType
      )
        return resultErrorCreate(
          "catalogPublication",
          "Catalog manifest blob identity does not match its immutable object",
        )
      return { success: true, data: null }
    }
    const inserted = databaseRecordInsert(transaction, blobTable, blob)
    if (!inserted.success) return inserted
    return { success: true, data: null }
  }

  const publicationCommit = (
    prepared: PreparedPublication,
    projectId: string,
    environment: "development" | "production",
    assetId: string | undefined,
    outputs: readonly PublishedOutput[],
    rebuild: boolean,
  ): Result<null> =>
    databaseTransactionRun<null>(
      db,
      (transaction) => {
        const current = transaction
          .select()
          .from(catalogTable)
          .where(and(eq(catalogTable.projectId, projectId), eq(catalogTable.environment, environment)))
          .get()
        if ((current?.generationId ?? null) !== prepared.snapshot.generationId)
          return resultErrorCreate("catalogPublicationConflict", "Catalog publication was superseded concurrently")

        if (rebuild) {
          const currentVersionIds = transaction
            .select({ id: outputVersionTable.id })
            .from(outputVersionTable)
            .where(and(eq(outputVersionTable.projectId, projectId), eq(outputVersionTable.current, true)))
            .orderBy(
              asc(outputVersionTable.assetId),
              asc(outputVersionTable.outputDefinitionId),
              asc(outputVersionTable.id),
            )
            .all()
            .map((version) => version.id)
          if (
            currentVersionIds.length !== prepared.snapshot.currentVersionIds?.length ||
            currentVersionIds.some((id, index) => id !== prepared.snapshot.currentVersionIds?.[index])
          )
            return resultErrorCreate("catalogPublicationConflict", "Current output versions changed concurrently")
        }

        if (!rebuild) {
          if (assetId === undefined) return resultErrorCreate("catalogAssetPublish", "Published asset was missing")
          for (const output of outputs) {
            const version = transaction
              .select({ id: outputVersionTable.id, assetId: outputVersionTable.assetId })
              .from(outputVersionTable)
              .where(and(eq(outputVersionTable.projectId, projectId), eq(outputVersionTable.id, output.version.id)))
              .get()
            if (version === undefined || version.assetId !== assetId)
              return resultErrorCreate("catalogAssetPublish", "Published output record is missing")
          }
          transaction
            .update(outputVersionTable)
            .set({ current: false })
            .where(and(eq(outputVersionTable.projectId, projectId), eq(outputVersionTable.assetId, assetId)))
            .run()
          for (const output of outputs) {
            transaction
              .update(outputVersionTable)
              .set({ current: true })
              .where(eq(outputVersionTable.id, output.version.id))
              .run()
          }
        }

        const generation = transaction
          .select()
          .from(catalogGenerationTable)
          .where(eq(catalogGenerationTable.id, prepared.generationId))
          .get()
        if (generation === undefined) {
          const inserted = databaseRecordInsert(transaction, catalogGenerationTable, {
            id: prepared.generationId,
            projectId,
            environment,
            digest: prepared.digest,
            manifestObjectKey: prepared.manifestObjectKey,
            rendererVersion,
            createdAt: prepared.generatedAt,
          })
          if (!inserted.success) return inserted
        } else if (
          generation.projectId !== projectId ||
          generation.environment !== environment ||
          generation.digest !== prepared.digest ||
          generation.manifestObjectKey !== prepared.manifestObjectKey
        ) {
          return resultErrorCreate("catalogPublication", "Catalog generation identity does not match its manifest")
        }

        const manifest = transaction
          .select()
          .from(manifestTable)
          .where(eq(manifestTable.catalogGenerationId, prepared.generationId))
          .get()
        if (manifest === undefined) {
          const inserted = databaseRecordInsert(transaction, manifestTable, {
            id: `manifest-${prepared.generationId}`,
            projectId,
            assetId: null,
            catalogGenerationId: prepared.generationId,
            kind: "catalog",
            schema: "assets.catalog.v1",
            objectKey: prepared.manifestObjectKey,
            byteSize: prepared.manifestBytes.byteLength,
            sha256: prepared.manifestSha256,
            createdAt: prepared.generatedAt,
          })
          if (!inserted.success) return inserted
        } else if (
          manifest.projectId !== projectId ||
          manifest.kind !== "catalog" ||
          manifest.schema !== "assets.catalog.v1" ||
          manifest.objectKey !== prepared.manifestObjectKey ||
          manifest.byteSize !== prepared.manifestBytes.byteLength ||
          manifest.sha256 !== prepared.manifestSha256
        ) {
          return resultErrorCreate(
            "catalogPublication",
            "Catalog manifest identity does not match its immutable object",
          )
        }

        const blob = blobRepositoryEnsure(transaction, {
          id: `blob-manifest-${prepared.generationId}`,
          projectId,
          assetId: null,
          sourceRevisionId: null,
          outputVersionId: null,
          storage: "private",
          environment,
          kind: "manifest",
          objectKey: prepared.manifestObjectKey,
          byteSize: prepared.manifestBytes.byteLength,
          sha256: prepared.manifestSha256,
          mediaType: "application/json",
          createdAt: prepared.generatedAt,
        })
        if (!blob.success) return blob
        transaction.delete(catalogOutputTable).where(eq(catalogOutputTable.generationId, prepared.generationId)).run()
        for (const output of prepared.canonicalOutputs) {
          const inserted = databaseRecordInsert(transaction, catalogOutputTable, output)
          if (!inserted.success) return inserted
        }

        if (current === undefined) {
          const inserted = databaseRecordInsert(transaction, catalogTable, {
            id: prepared.snapshot.catalogId,
            projectId,
            environment,
            generationId: prepared.generationId,
            schema: "assets.catalog.v1",
            digest: prepared.digest,
            rendererVersion,
            generatedAt: prepared.generatedAt,
            updatedAt: prepared.generatedAt,
          })
          if (!inserted.success) return inserted
        } else {
          const updated = transaction
            .update(catalogTable)
            .set({
              generationId: prepared.generationId,
              digest: prepared.digest,
              generatedAt: prepared.generatedAt,
              updatedAt: prepared.generatedAt,
            })
            .where(and(eq(catalogTable.id, current.id), eq(catalogTable.generationId, prepared.snapshot.generationId!)))
            .returning({ id: catalogTable.id })
            .get()
          if (updated === undefined)
            return resultErrorCreate("catalogPublicationConflict", "Catalog pointer changed concurrently")
        }
        return { success: true, data: null }
      },
      { behavior: "immediate" },
    )

  const catalogAssetPublish: CatalogPublicationService["catalogAssetPublish"] = async (context, outputs, now) => {
    for (let attempt = 0; attempt < maxPublicationAttempts; attempt += 1) {
      const snapshot = catalogSnapshotRead(context.asset.projectId, context.environment.name)
      if (!snapshot.success) return snapshot
      const nextOutputs = [
        ...snapshot.data.previousOutputs
          .filter((output) => output.assetId !== context.asset.id)
          .map(({ generationId: _generationId, ...output }) => ({
            ...output,
            generationId: snapshot.data.generationId ?? "",
          })),
        ...outputs.map((output) => ({
          generationId: snapshot.data.generationId ?? "",
          assetId: context.asset.id,
          outputVersionId: output.version.id,
          class: context.asset.class,
          key: output.definition.key,
          property: catalogEntryPropertyCreate({
            folders: [context.asset.folder1, context.asset.folder2, context.asset.folder3].filter(
              (folder): folder is string => folder !== null,
            ),
            basename: context.asset.basename,
            key: output.definition.key,
          }),
          path: output.version.objectKey,
          metadata: output.metadata,
        })),
      ]
      const prepared = publicationPrepare(
        snapshot.data,
        context.asset.projectId,
        context.environment.name,
        context.binding,
        nextOutputs,
        now,
        `catalog-generation-${context.asset.id}-${context.source.id}`,
      )
      if (!prepared.success) return prepared
      const location = storageObjectLocationCreate(context.binding, "private-source", prepared.data.manifestObjectKey)
      if (!location.success) return location
      const stored = await storageObjectPutEnsure(
        location.data,
        prepared.data.manifestBytes,
        "application/json",
        prepared.data.manifestSha256,
      )
      if (!stored.success) return stored
      const committed = publicationCommit(
        prepared.data,
        context.asset.projectId,
        context.environment.name,
        context.asset.id,
        outputs,
        false,
      )
      if (committed.success) return { success: true, data: prepared.data.result }
      if (committed.op !== "catalogPublicationConflict") return committed
    }
    return resultErrorCreate("catalogAssetPublish", "Catalog publication could not be committed after retrying")
  }

  const catalogProductionRebuild: CatalogPublicationService["catalogProductionRebuild"] = async (
    projectId,
    now = new Date(),
  ) => {
    for (let attempt = 0; attempt < maxPublicationAttempts; attempt += 1) {
      const snapshot = rebuildSnapshotRead(projectId)
      if (!snapshot.success) return snapshot
      const binding = storageBindingResolve(snapshot.data.environment, projectId)
      if (!binding.success) return binding
      const nextOutputs = snapshot.data.outputs.map((output) => ({
        generationId: snapshot.data.generationId ?? "",
        assetId: output.asset.id,
        outputVersionId: output.version.id,
        class: output.asset.class,
        key: output.definition.key,
        property: catalogEntryPropertyCreate({
          folders: [output.asset.folder1, output.asset.folder2, output.asset.folder3].filter(
            (folder): folder is string => folder !== null,
          ),
          basename: output.asset.basename,
          key: output.definition.key,
        }),
        path: output.version.objectKey,
        metadata: output.metadata,
      }))
      const prepared = publicationPrepare(
        snapshot.data,
        projectId,
        "production",
        binding.data,
        nextOutputs,
        now,
        `catalog-generation-${projectId}-rebuild`,
      )
      if (!prepared.success) return prepared
      const location = storageObjectLocationCreate(binding.data, "private-source", prepared.data.manifestObjectKey)
      if (!location.success) return location
      const stored = await storageObjectPutEnsure(
        location.data,
        prepared.data.manifestBytes,
        "application/json",
        prepared.data.manifestSha256,
      )
      if (!stored.success) return stored
      const committed = publicationCommit(prepared.data, projectId, "production", undefined, [], true)
      if (committed.success) return { success: true, data: prepared.data.result }
      if (committed.op !== "catalogPublicationConflict") return committed
    }
    return resultErrorCreate("catalogProductionRebuild", "Catalog rebuild could not be committed after retrying")
  }

  return { catalogAssetPublish, catalogProductionRebuild }
}
