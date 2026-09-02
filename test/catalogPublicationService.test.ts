import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { and, eq } from "drizzle-orm"

import { assetApiRepositoryCreate } from "../src/asset/assetApiRepositoryCreate.js"
import { catalogApiRepositoryCreate } from "../src/catalog/catalogApiRepositoryCreate.js"
import { catalogPublicationServiceCreate } from "../src/catalog/catalogPublicationServiceCreate.js"
import { fixtureDatabaseSeed } from "../src/fixture/fixtureDatabaseSeed.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import type { DatabaseConnection } from "../src/infrastructure/db/databaseConnection.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { catalogGenerationTable } from "../src/infrastructure/db/schema/catalogGenerationTable.js"
import { catalogOutputTable } from "../src/infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../src/infrastructure/db/schema/catalogTable.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { manifestTable } from "../src/infrastructure/db/schema/manifestTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../src/infrastructure/db/schema/outputVersionTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { storageMigrationRepositoryCreate } from "../src/migration/storageMigrationRepositoryCreate.js"
import { resultErrorCreate } from "../src/schemas/resultErrorCreate.js"
import type { StorageAdapter } from "../src/storage/storageAdapter.js"
import { storageBindingResolve } from "../src/storage/storageBindingResolve.js"

const setupCreate = async () => {
  const directory = await mkdtemp(join(tmpdir(), "assets-catalog-publication-"))
  const path = join(directory, "assets.sqlite")
  const first = databaseOpen(path)
  if (!first.success) throw new Error(first.errorMessage)
  const migrated = databaseMigrate(first.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  const seeded = fixtureDatabaseSeed(first.data.db)
  if (!seeded.success) throw new Error(seeded.errorMessage)
  const second = databaseOpen(path)
  if (!second.success) throw new Error(second.errorMessage)
  return { directory, first: first.data, second: second.data, seed: seeded.data }
}

const contextRead = (db: DatabaseConnection, assetId: string) => {
  const asset = db.db.select().from(assetTable).where(eq(assetTable.id, assetId)).get()
  if (asset === undefined) throw new Error("asset missing")
  const source = db.db
    .select()
    .from(sourceRevisionTable)
    .where(eq(sourceRevisionTable.id, asset.currentSourceRevisionId))
    .get()
  const environment = db.db
    .select()
    .from(environmentTable)
    .where(and(eq(environmentTable.projectId, asset.projectId), eq(environmentTable.name, "development")))
    .get()
  if (source === undefined || environment === undefined) throw new Error("publication context missing")
  const binding = storageBindingResolve(environment, asset.projectId)
  if (!binding.success) throw new Error(binding.errorMessage)
  return { asset, source, environment, binding: binding.data }
}

test("catalog publication revalidates a two-connection race without losing outputs", async () => {
  const setup = await setupCreate()
  try {
    const heroContext = contextRead(setup.first, "asset-hero")
    const introContext = contextRead(setup.second, "asset-intro")
    const heroDefinition = setup.first.db
      .select()
      .from(outputDefinitionTable)
      .where(eq(outputDefinitionTable.id, "output-hero-large"))
      .get()
    const heroVersion = setup.first.db
      .select()
      .from(outputVersionTable)
      .where(eq(outputVersionTable.id, "version-output-hero-large"))
      .get()
    const introDefinition = setup.second.db
      .select()
      .from(outputDefinitionTable)
      .where(eq(outputDefinitionTable.id, "output-intro"))
      .get()
    const introVersion = setup.second.db
      .select()
      .from(outputVersionTable)
      .where(eq(outputVersionTable.id, "version-output-intro"))
      .get()
    const heroMetadata = setup.first.db
      .select({ metadata: catalogOutputTable.metadata })
      .from(catalogOutputTable)
      .where(eq(catalogOutputTable.outputVersionId, "version-output-hero-large"))
      .get()?.metadata
    if (
      heroDefinition === undefined ||
      heroVersion === undefined ||
      introDefinition === undefined ||
      introVersion === undefined ||
      heroMetadata === undefined
    )
      throw new Error("publication output fixture missing")

    let release: (() => void) | undefined
    let putCount = 0
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const baseStorage = memoryStorageAdapterCreate()
    const storage: StorageAdapter = {
      ...baseStorage,
      putImmutable: async (input) => {
        putCount += 1
        if (putCount === 2) release?.()
        await gate
        return baseStorage.putImmutable(input)
      },
    }
    const firstService = catalogPublicationServiceCreate(setup.first.db, storage)
    const secondService = catalogPublicationServiceCreate(setup.second.db, storage)
    const firstPublication = firstService.catalogAssetPublish(
      heroContext,
      [
        {
          version: { ...heroVersion, objectKey: "images/home/hero_rebuilt_v2.webp" },
          definition: heroDefinition,
          metadata: heroMetadata,
        },
      ],
      new Date("2026-08-31T00:00:00.000Z"),
    )
    const secondPublication = secondService.catalogAssetPublish(
      introContext,
      [
        {
          version: introVersion,
          definition: introDefinition,
          metadata: {
            kind: "video",
            width: 1920,
            height: 1080,
            durationSeconds: 1,
            frameRate: 30,
            container: "mp4",
            videoCodec: "h264",
            audioCodec: null,
            streams: 1,
            bitrate: null,
          },
        },
      ],
      new Date("2026-08-31T00:00:00.000Z"),
    )
    const [firstResult, secondResult] = await Promise.all([firstPublication, secondPublication])

    expect(firstResult.success).toBe(true)
    expect(secondResult.success).toBe(true)
    expect(putCount).toBeGreaterThanOrEqual(2)
    const current = catalogApiRepositoryCreate(setup.first.db).catalogCurrentRead("project-fixture", "development")
    expect(current.success).toBe(true)
    if (current.success && current.data !== null) {
      expect(current.data.catalog.outputs.map((output) => output.path)).toEqual(
        expect.arrayContaining(["images/home/hero_rebuilt_v2.webp", introVersion.objectKey]),
      )
    }
  } finally {
    databaseClose(setup.second)
    databaseClose(setup.first)
    await rm(setup.directory, { recursive: true, force: true })
  }
})

test("leaves only an orphaned manifest when migration starts after catalog storage", async () => {
  const setup = await setupCreate()
  try {
    const context = contextRead(setup.first, "asset-hero")
    const definition = setup.first.db
      .select()
      .from(outputDefinitionTable)
      .where(eq(outputDefinitionTable.id, "output-hero-large"))
      .get()
    const version = setup.first.db
      .select()
      .from(outputVersionTable)
      .where(eq(outputVersionTable.id, "version-output-hero-large"))
      .get()
    const metadata = setup.first.db
      .select({ metadata: catalogOutputTable.metadata })
      .from(catalogOutputTable)
      .where(eq(catalogOutputTable.outputVersionId, "version-output-hero-large"))
      .get()?.metadata
    if (definition === undefined || version === undefined || metadata === undefined)
      throw new Error("publication fixture missing")

    let manifestLocation: Parameters<StorageAdapter["putImmutable"]>[0]["location"] | undefined
    let manifestStored!: () => void
    const stored = new Promise<void>((resolve) => {
      manifestStored = resolve
    })
    let releaseManifest!: () => void
    const manifestReleased = new Promise<void>((resolve) => {
      releaseManifest = resolve
    })
    const baseStorage = memoryStorageAdapterCreate()
    const storage: StorageAdapter = {
      ...baseStorage,
      putImmutable: async (input) => {
        const result = await baseStorage.putImmutable(input)
        if (input.location.namespace === "private-source" && input.location.key.startsWith("catalogs/")) {
          manifestLocation = input.location
          manifestStored()
          await manifestReleased
        }
        return result
      },
    }
    const publication = catalogPublicationServiceCreate(setup.first.db, storage).catalogAssetPublish(
      context,
      [{ version, definition, metadata }],
      new Date("2026-08-31T00:00:00.000Z"),
    )
    await stored

    setup.second.db
      .update(workflowTable)
      .set({ status: "succeeded" })
      .where(eq(workflowTable.id, `workflow-deletion-${setup.seed.partialDeletionAssetId}`))
      .run()
    const migrationRepository = storageMigrationRepositoryCreate(setup.second.db)
    const migration = migrationRepository.storageMigrationCreate({
      projectId: "project-fixture",
      environmentId: "environment-development",
      idempotencyKey: "migration-after-catalog-storage",
      sourceBinding: {
        projectId: "project-fixture",
        environmentId: "environment-development",
        environment: "development",
        bucket: "assets-development",
        prefix: "contentoren",
        publicBaseUrl: "https://assets-development.fixture.invalid",
      },
      targetBinding: {
        projectId: "project-fixture",
        environmentId: "environment-development",
        environment: "development",
        bucket: "assets-development-target",
        prefix: "contentoren-target",
        publicBaseUrl: "https://assets-development-target.fixture.invalid",
      },
    })
    expect(migration).toMatchObject({ success: true })
    releaseManifest()

    expect(await publication).toMatchObject({
      success: false,
      op: "storageMutationAssert",
      retryable: true,
    })
    expect(manifestLocation).toBeDefined()
    if (manifestLocation === undefined) return
    expect(await baseStorage.headObject(manifestLocation)).toMatchObject({ success: true })
    expect(setup.first.db.select().from(catalogGenerationTable).all()).toHaveLength(1)
    expect(setup.first.db.select().from(manifestTable).all()).toHaveLength(0)
    expect(setup.first.db.select().from(catalogOutputTable).all()).toHaveLength(2)
    expect(setup.first.db.select().from(catalogTable).get()?.generationId).toBe("generation-1")
  } finally {
    databaseClose(setup.second)
    databaseClose(setup.first)
    await rm(setup.directory, { recursive: true, force: true })
  }
})

test("keeps historical and current catalog metadata immutable until a new generation is published", async () => {
  const setup = await setupCreate()
  try {
    const context = contextRead(setup.first, "asset-hero")
    const definition = setup.first.db
      .select()
      .from(outputDefinitionTable)
      .where(eq(outputDefinitionTable.id, "output-hero-large"))
      .get()
    const version = setup.first.db
      .select()
      .from(outputVersionTable)
      .where(eq(outputVersionTable.id, "version-output-hero-large"))
      .get()
    const storedOutput = setup.first.db
      .select()
      .from(catalogOutputTable)
      .where(eq(catalogOutputTable.outputVersionId, "version-output-hero-large"))
      .get()
    if (
      definition === undefined ||
      version === undefined ||
      storedOutput === undefined ||
      storedOutput.metadata.kind !== "image"
    )
      throw new Error("publication output fixture missing")

    const repository = catalogApiRepositoryCreate(setup.first.db)
    const metadataUpdated = assetApiRepositoryCreate(setup.first.db).assetMetadataSet(
      "project-fixture",
      "asset-hero",
      "Updated alt",
    )
    expect(metadataUpdated).toMatchObject({
      success: true,
      data: { asset: { metadata: { metadata: { kind: "image", alt: "Updated alt" } } } },
    })

    const currentBeforePublish = repository.catalogCurrentRead("project-fixture", "development")
    const historicalBeforePublish = repository.catalogRead("project-fixture", "generation-1", "development")
    const listsBeforePublish = repository.catalogListsRead("project-fixture", "development", {
      generationId: "generation-1",
    })
    if (
      !currentBeforePublish.success ||
      currentBeforePublish.data === null ||
      !historicalBeforePublish.success ||
      historicalBeforePublish.data === null ||
      !listsBeforePublish.success ||
      listsBeforePublish.data === null
    )
      throw new Error("catalog fixture missing")
    expect(
      currentBeforePublish.data.catalog.outputs.find((output) => output.assetId === "asset-hero")?.metadata,
    ).toMatchObject({ alt: "A wide product shot on a dark background" })
    expect(
      historicalBeforePublish.data.catalog.outputs.find((output) => output.assetId === "asset-hero")?.metadata,
    ).toMatchObject({ alt: "A wide product shot on a dark background" })
    expect(listsBeforePublish.data.imageList).toContain('"alt": "A wide product shot on a dark background"')
    expect(listsBeforePublish.data.imageList).not.toContain("Updated alt")

    const published = await catalogPublicationServiceCreate(
      setup.first.db,
      memoryStorageAdapterCreate(),
    ).catalogAssetPublish(
      context,
      [{ version, definition, metadata: { ...storedOutput.metadata, alt: "Updated alt" } }],
      new Date("2026-08-31T00:00:00.000Z"),
    )
    expect(published.success).toBe(true)
    if (!published.success) return

    const currentAfterPublish = repository.catalogCurrentRead("project-fixture", "development")
    const historyAfterPublish = repository.catalogsRead("project-fixture", "development", {})
    const historicalLists = repository.catalogListsRead("project-fixture", "development", {
      generationId: "generation-1",
    })
    const currentLists = repository.catalogListsRead("project-fixture", "development", {
      generationId: published.data.generationId,
    })
    if (
      !currentAfterPublish.success ||
      currentAfterPublish.data === null ||
      !historyAfterPublish.success ||
      !historicalLists.success ||
      historicalLists.data === null ||
      !currentLists.success ||
      currentLists.data === null
    )
      throw new Error("published catalog fixture missing")
    expect(
      currentAfterPublish.data.catalog.outputs.find((output) => output.assetId === "asset-hero")?.metadata,
    ).toMatchObject({ alt: "Updated alt" })
    expect(historyAfterPublish.data.items.find((item) => item.generationId === "generation-1")?.catalog).toEqual(
      historicalBeforePublish.data.catalog,
    )
    expect(historicalLists.data.imageList).toContain('"alt": "A wide product shot on a dark background"')
    expect(historicalLists.data.imageList).not.toContain("Updated alt")
    expect(currentLists.data.imageList).toContain('"alt": "Updated alt"')
  } finally {
    databaseClose(setup.second)
    databaseClose(setup.first)
    await rm(setup.directory, { recursive: true, force: true })
  }
})

test("production catalog rebuild is idempotent, isolated, and atomic on storage failure", async () => {
  const setup = await setupCreate()
  try {
    const storage = memoryStorageAdapterCreate()
    const service = catalogPublicationServiceCreate(setup.first.db, storage)
    const rebuilt = await service.catalogProductionRebuild("project-fixture", new Date("2026-08-31T00:00:00.000Z"))
    expect(rebuilt.success).toBe(true)
    if (!rebuilt.success) return
    expect(rebuilt.data.catalog.environment).toBe("production")
    expect(rebuilt.data.catalog.outputs).toHaveLength(5)
    const repeated = await service.catalogProductionRebuild("project-fixture", new Date("2026-08-31T01:00:00.000Z"))
    expect(repeated.success).toBe(true)
    if (!repeated.success) return
    expect(repeated.data.generationId).toBe(rebuilt.data.generationId)
    expect(
      setup.first.db
        .select()
        .from(catalogGenerationTable)
        .where(
          and(
            eq(catalogGenerationTable.projectId, "project-fixture"),
            eq(catalogGenerationTable.environment, "production"),
          ),
        )
        .all(),
    ).toHaveLength(1)

    const productionBefore = setup.first.db
      .select()
      .from(catalogTable)
      .where(and(eq(catalogTable.projectId, "project-fixture"), eq(catalogTable.environment, "production")))
      .get()
    const otherProject = await service.catalogProductionRebuild("other-project")
    expect(otherProject.success).toBe(false)
    expect(
      setup.first.db
        .select()
        .from(catalogTable)
        .where(and(eq(catalogTable.projectId, "project-fixture"), eq(catalogTable.environment, "production")))
        .get(),
    ).toEqual(productionBefore)

    const failureStorage: StorageAdapter = {
      ...memoryStorageAdapterCreate(),
      putImmutable: async () => resultErrorCreate("testStorage", "manifest write failed"),
    }
    const failureSetup = await setupCreate()
    try {
      const failed = await catalogPublicationServiceCreate(
        failureSetup.first.db,
        failureStorage,
      ).catalogProductionRebuild("project-fixture")
      expect(failed.success).toBe(false)
      expect(
        failureSetup.first.db.select().from(catalogTable).where(eq(catalogTable.environment, "production")).all(),
      ).toHaveLength(0)
      expect(failureSetup.first.db.select().from(catalogGenerationTable).all()).toHaveLength(1)
    } finally {
      databaseClose(failureSetup.second)
      databaseClose(failureSetup.first)
      await rm(failureSetup.directory, { recursive: true, force: true })
    }
  } finally {
    databaseClose(setup.second)
    databaseClose(setup.first)
    await rm(setup.directory, { recursive: true, force: true })
  }
})
