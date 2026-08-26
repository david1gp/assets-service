import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { assetStructureFolderMembershipTable } from "../src/infrastructure/db/schema/assetStructureFolderMembershipTable.js"
import { blobTable } from "../src/infrastructure/db/schema/blobTable.js"
import { catalogGenerationTable } from "../src/infrastructure/db/schema/catalogGenerationTable.js"
import { catalogOutputTable } from "../src/infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../src/infrastructure/db/schema/catalogTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../src/infrastructure/db/schema/outputVersionTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { manifestTable } from "../src/infrastructure/db/schema/manifestTable.js"
import { structureFolderTable } from "../src/infrastructure/db/schema/structureFolderTable.js"
import { structureFolderRepositoryCreate } from "../src/structure/structureFolderRepositoryCreate.js"

const now = "2026-08-17T00:00:00.000Z"

const databaseCreate = () => {
  const opened = databaseOpen(":memory:")
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  expect(
    databaseRecordInsert(opened.data.db, organizationTable, {
      id: "org-1",
      name: "Example",
      slug: "example",
      createdAt: now,
      updatedAt: now,
    }).success,
  ).toBe(true)
  expect(
    databaseRecordInsert(opened.data.db, projectTable, {
      id: "project-1",
      organizationId: "org-1",
      name: "Example",
      slug: "example",
      defaultEnvironment: "development",
      createdAt: now,
      updatedAt: now,
    }).success,
  ).toBe(true)
  const assets = databaseTransactionRun(opened.data.db, (transaction) => {
    for (const asset of [
      { id: "asset-1", sourceId: "source-1", folder2: "nested", folder3: "deep", filename: "hero.jpg" },
      { id: "asset-2", sourceId: "source-2", folder2: null, folder3: null, filename: "logo.svg" },
    ]) {
      const insertedAsset = databaseRecordInsert(transaction, assetTable, {
        id: asset.id,
        projectId: "project-1",
        class: "image",
        folder1: "legacy",
        folder2: asset.folder2,
        folder3: asset.folder3,
        filename: asset.filename,
        basename: asset.filename.slice(0, -4),
        currentSourceRevisionId: asset.sourceId,
        integrationNote: null,
        createdAt: now,
        updatedAt: now,
      })
      if (!insertedAsset.success) return insertedAsset
      const insertedSource = databaseRecordInsert(transaction, sourceRevisionTable, {
        id: asset.sourceId,
        assetId: asset.id,
        revision: 1,
        class: "image",
        originalFilename: asset.filename,
        mediaType: "image/jpeg",
        byteSize: 10,
        sha256: "a".repeat(64),
        objectKey: `sources/${asset.id}/hero.jpg`,
        createdAt: now,
      })
      if (!insertedSource.success) return insertedSource
    }
    return { success: true, data: null } as const
  })
  if (!assets.success) throw new Error(assets.errorMessage)
  return opened.data
}

const migrationFolderCreate = (includeStructureMigration: boolean) => {
  const sourceFolder = resolve("drizzle")
  const migrationFolder = mkdtempSync(join(tmpdir(), "assets-structure-migrations-"))
  const metaFolder = join(migrationFolder, "meta")
  mkdirSync(metaFolder)
  for (const filename of readdirSync(sourceFolder)) {
    if (!filename.endsWith(".sql")) continue
    if (!includeStructureMigration && (filename.startsWith("0009_") || filename.startsWith("0010_"))) continue
    copyFileSync(join(sourceFolder, filename), join(migrationFolder, filename))
  }
  const journal = JSON.parse(readFileSync(join(sourceFolder, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string }[]
    [key: string]: unknown
  }
  if (!includeStructureMigration)
    journal.entries = journal.entries.filter(
      (entry) => entry.tag !== "0009_structure_folders" && entry.tag !== "0010_backup_remote_path_migration_runs",
    )
  writeFileSync(join(metaFolder, "_journal.json"), JSON.stringify(journal))
  return migrationFolder
}

const legacyDatabaseCreate = () => {
  const migrationFolder = migrationFolderCreate(false)
  const opened = databaseOpen(":memory:")
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data, migrationFolder)
  if (!migrated.success) {
    databaseClose(opened.data)
    rmSync(migrationFolder, { recursive: true, force: true })
    throw new Error(migrated.errorMessage)
  }
  return { connection: opened.data, migrationFolder }
}

describe("structure folder repository", () => {
  test("backfills canonical folders once with project isolation and three levels", () => {
    const legacy = legacyDatabaseCreate()
    try {
      expect(
        databaseRecordInsert(legacy.connection.db, organizationTable, {
          id: "org-1",
          name: "Example",
          slug: "example",
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(legacy.connection.db, organizationTable, {
          id: "org-2",
          name: "Other",
          slug: "other",
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)
      for (const [id, organizationId] of [
        ["project-1", "org-1"],
        ["project-2", "org-2"],
      ] as const) {
        expect(
          databaseRecordInsert(legacy.connection.db, projectTable, {
            id,
            organizationId,
            name: id,
            slug: id,
            defaultEnvironment: "development",
            createdAt: now,
            updatedAt: now,
          }).success,
        ).toBe(true)
      }
      const assets = [
        ["asset-root", "project-1", "shared", null, null],
        ["asset-child", "project-1", "shared", "child", null],
        ["asset-grandchild", "project-1", "shared", "child", "grandchild"],
        ["asset-unassigned", "project-1", null, null, null],
        ["asset-other-child", "project-2", "shared", "child", null],
      ] as const
      const insertedAssets = databaseTransactionRun(legacy.connection.db, (transaction) => {
        for (const [id, projectId, folder1, folder2, folder3] of assets) {
          const inserted = databaseRecordInsert(transaction, assetTable, {
            id,
            projectId,
            class: "image",
            folder1,
            folder2,
            folder3,
            filename: `${id}.jpg`,
            basename: id,
            currentSourceRevisionId: `source-${id}`,
            integrationNote: null,
            createdAt: now,
            updatedAt: now,
          })
          if (!inserted.success) return inserted
          const source = databaseRecordInsert(transaction, sourceRevisionTable, {
            id: `source-${id}`,
            assetId: id,
            revision: 1,
            class: "image",
            originalFilename: `${id}.jpg`,
            mediaType: "image/jpeg",
            byteSize: 10,
            sha256: id.padEnd(64, "a"),
            objectKey: `sources/${id}.jpg`,
            createdAt: now,
          })
          if (!source.success) return source
        }
        return { success: true, data: null } as const
      })
      if (!insertedAssets.success)
        throw new Error(`${insertedAssets.errorMessage} ${JSON.stringify(insertedAssets.rawData)}`)

      const structureMigrationFolder = migrationFolderCreate(true)
      try {
        const migrated = databaseMigrate(legacy.connection, structureMigrationFolder)
        expect(migrated).toEqual({ success: true, data: null })
      } finally {
        rmSync(structureMigrationFolder, { recursive: true, force: true })
      }
      const foldersBefore = legacy.connection.db
        .select()
        .from(structureFolderTable)
        .all()
        .sort((left, right) =>
          `${left.projectId}/${left.depth}/${left.name}`.localeCompare(
            `${right.projectId}/${right.depth}/${right.name}`,
          ),
        )
      const membershipsBefore = legacy.connection.db
        .select()
        .from(assetStructureFolderMembershipTable)
        .all()
        .sort((left, right) => left.assetId.localeCompare(right.assetId))
      expect(foldersBefore).toHaveLength(5)
      expect(
        foldersBefore.map((folder) => ({ projectId: folder.projectId, name: folder.name, depth: folder.depth })),
      ).toEqual([
        { projectId: "project-1", name: "shared", depth: 1 },
        { projectId: "project-1", name: "child", depth: 2 },
        { projectId: "project-1", name: "grandchild", depth: 3 },
        { projectId: "project-2", name: "shared", depth: 1 },
        { projectId: "project-2", name: "child", depth: 2 },
      ])
      expect(membershipsBefore).toHaveLength(4)
      expect(membershipsBefore.find((membership) => membership.assetId === "asset-unassigned")).toBeUndefined()
      const expectedMembershipFolders = new Map([
        ["asset-root", { projectId: "project-1", name: "shared", depth: 1 }],
        ["asset-child", { projectId: "project-1", name: "child", depth: 2 }],
        ["asset-grandchild", { projectId: "project-1", name: "grandchild", depth: 3 }],
        ["asset-other-child", { projectId: "project-2", name: "child", depth: 2 }],
      ])
      for (const membership of membershipsBefore) {
        const folder = legacy.connection.db
          .select()
          .from(structureFolderTable)
          .where(eq(structureFolderTable.id, membership.structureFolderId))
          .get()
        const expected = expectedMembershipFolders.get(membership.assetId)
        expect(expected).toBeDefined()
        expect(folder).toMatchObject(expected ?? {})
      }
      const foldersAfterFirstMigration = legacy.connection.db.select().from(structureFolderTable).all()
      const membershipsAfterFirstMigration = legacy.connection.db
        .select()
        .from(assetStructureFolderMembershipTable)
        .all()
      const rerunFolder = migrationFolderCreate(true)
      try {
        expect(databaseMigrate(legacy.connection, rerunFolder)).toEqual({ success: true, data: null })
      } finally {
        rmSync(rerunFolder, { recursive: true, force: true })
      }
      expect(legacy.connection.db.select().from(structureFolderTable).all()).toEqual(foldersAfterFirstMigration)
      expect(legacy.connection.db.select().from(assetStructureFolderMembershipTable).all()).toEqual(
        membershipsAfterFirstMigration,
      )
    } finally {
      databaseClose(legacy.connection)
      rmSync(legacy.migrationFolder, { recursive: true, force: true })
    }
  })

  test("keeps logical membership separate, scopes operations, and cascades folder deletion", () => {
    const connection = databaseCreate()
    try {
      const repository = structureFolderRepositoryCreate(connection.db)
      const root = repository.structureFolderCreate("project-1", { name: "images" })
      expect(root).toMatchObject({ success: true, data: { depth: 1, parentId: null, name: "images" } })
      if (!root.success) return
      const child = repository.structureFolderCreate("project-1", { name: "featured", parentId: root.data.id })
      expect(child).toMatchObject({ success: true, data: { depth: 2, parentId: root.data.id } })
      if (!child.success) return
      const archive = repository.structureFolderCreate("project-1", { name: "archive" })
      expect(archive).toMatchObject({ success: true, data: { depth: 1, parentId: null } })
      if (!archive.success) return
      const duplicate = repository.structureFolderCreate("project-1", { name: "images" })
      expect(duplicate.success).toBe(false)

      expect(
        databaseRecordInsert(connection.db, outputDefinitionTable, {
          id: "definition-1",
          assetId: "asset-1",
          kind: "image",
          key: "web",
          width: 100,
          height: 100,
          format: "webp",
          quality: 80,
          showAiLabel: null,
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(connection.db, outputVersionTable, {
          id: "version-1",
          outputDefinitionId: "definition-1",
          assetId: "asset-1",
          sourceRevisionId: "source-1",
          version: 1,
          byteSize: 20,
          sha256: "b".repeat(64),
          mediaType: "image/webp",
          extension: "webp",
          objectKey: "outputs/asset-1/web.webp",
          toolchainVersion: "test",
          width: 100,
          height: 100,
          current: true,
          createdAt: now,
        }).success,
      ).toBe(true)
      for (const blob of [
        {
          id: "blob-source-1",
          sourceRevisionId: "source-1",
          outputVersionId: null,
          kind: "source" as const,
          objectKey: "sources/asset-1/hero.jpg",
          sha256: "c".repeat(64),
        },
        {
          id: "blob-output-1",
          sourceRevisionId: null,
          outputVersionId: "version-1",
          kind: "output" as const,
          objectKey: "outputs/asset-1/web.webp",
          sha256: "d".repeat(64),
        },
      ]) {
        expect(
          databaseRecordInsert(connection.db, blobTable, {
            ...blob,
            projectId: "project-1",
            assetId: "asset-1",
            storage: "private",
            environment: "development",
            byteSize: 20,
            mediaType: "image/jpeg",
            createdAt: now,
          }).success,
        ).toBe(true)
      }
      expect(
        databaseRecordInsert(connection.db, catalogGenerationTable, {
          id: "generation-1",
          projectId: "project-1",
          environment: "production",
          digest: "e".repeat(64),
          manifestObjectKey: "manifests/project-1/catalog.json",
          rendererVersion: "test",
          createdAt: now,
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(connection.db, catalogTable, {
          id: "catalog-1",
          projectId: "project-1",
          environment: "production",
          generationId: "generation-1",
          schema: "1",
          digest: "f".repeat(64),
          rendererVersion: "test",
          generatedAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(connection.db, catalogOutputTable, {
          generationId: "generation-1",
          assetId: "asset-1",
          outputVersionId: "version-1",
          class: "image",
          key: "web",
          property: "src",
          path: "/assets/asset-1/web.webp",
          metadata: {
            kind: "image",
            width: 100,
            height: 100,
            format: "webp",
            colorSpace: "srgb",
            alpha: false,
            orientationApplied: true,
            frameCount: 1,
            animated: false,
            alt: null,
            aiProvenance: null,
          },
        }).success,
      ).toBe(true)
      for (const manifest of [
        { id: "manifest-asset-1", assetId: "asset-1", kind: "asset" as const, objectKey: "manifests/asset-1.json" },
        {
          id: "manifest-catalog-1",
          assetId: null,
          kind: "catalog" as const,
          objectKey: "manifests/project-1/catalog.json",
        },
      ]) {
        expect(
          databaseRecordInsert(connection.db, manifestTable, {
            ...manifest,
            projectId: "project-1",
            catalogGenerationId: "generation-1",
            schema: "1",
            byteSize: 20,
            sha256: (manifest.id === "manifest-asset-1" ? "1" : "2").repeat(64),
            createdAt: now,
          }).success,
        ).toBe(true)
      }

      const identityBefore = {
        asset: connection.db.select().from(assetTable).where(eq(assetTable.id, "asset-1")).get(),
        source: connection.db.select().from(sourceRevisionTable).where(eq(sourceRevisionTable.id, "source-1")).get(),
        definition: connection.db
          .select()
          .from(outputDefinitionTable)
          .where(eq(outputDefinitionTable.id, "definition-1"))
          .get(),
        version: connection.db.select().from(outputVersionTable).where(eq(outputVersionTable.id, "version-1")).get(),
        blobs: connection.db.select().from(blobTable).where(eq(blobTable.assetId, "asset-1")).all(),
        generation: connection.db
          .select()
          .from(catalogGenerationTable)
          .where(eq(catalogGenerationTable.id, "generation-1"))
          .get(),
        catalog: connection.db.select().from(catalogTable).where(eq(catalogTable.id, "catalog-1")).get(),
        catalogOutputs: connection.db.select().from(catalogOutputTable).all(),
        manifests: connection.db.select().from(manifestTable).all(),
      }

      expect(repository.assetStructureFolderMembershipSet("project-1", "asset-1", child.data.id)).toMatchObject({
        success: true,
        data: { assetId: "asset-1", structureFolderId: child.data.id },
      })
      expect(repository.assetStructureFolderMembershipSet("project-1", "asset-2", root.data.id)).toMatchObject({
        success: true,
        data: { assetId: "asset-2", structureFolderId: root.data.id },
      })
      expect(repository.assetStructureFolderMembershipSet("other-project", "asset-1", root.data.id)).toEqual({
        success: true,
        data: null,
      })

      const moved = repository.assetStructureFolderMembershipSet("project-1", "asset-1", root.data.id)
      expect(moved).toMatchObject({ success: true, data: { assetId: "asset-1", structureFolderId: root.data.id } })
      expect(repository.assetStructureFolderMembershipSet("project-1", "asset-1", archive.data.id)).toMatchObject({
        success: true,
        data: { assetId: "asset-1", structureFolderId: archive.data.id },
      })
      expect(repository.assetStructureFolderMembershipSet("project-1", "asset-1", null)).toEqual({
        success: true,
        data: null,
      })
      expect(connection.db.select().from(workflowTable).all()).toHaveLength(0)
      expect({
        asset: connection.db.select().from(assetTable).where(eq(assetTable.id, "asset-1")).get(),
        source: connection.db.select().from(sourceRevisionTable).where(eq(sourceRevisionTable.id, "source-1")).get(),
        definition: connection.db
          .select()
          .from(outputDefinitionTable)
          .where(eq(outputDefinitionTable.id, "definition-1"))
          .get(),
        version: connection.db.select().from(outputVersionTable).where(eq(outputVersionTable.id, "version-1")).get(),
        blobs: connection.db.select().from(blobTable).where(eq(blobTable.assetId, "asset-1")).all(),
        generation: connection.db
          .select()
          .from(catalogGenerationTable)
          .where(eq(catalogGenerationTable.id, "generation-1"))
          .get(),
        catalog: connection.db.select().from(catalogTable).where(eq(catalogTable.id, "catalog-1")).get(),
        catalogOutputs: connection.db.select().from(catalogOutputTable).all(),
        manifests: connection.db.select().from(manifestTable).all(),
      }).toEqual(identityBefore)

      const structure = repository.structureRead("project-1")
      expect(structure).toMatchObject({ success: true })
      if (!structure.success) return
      expect(structure.data.folders.map((folder) => folder.name)).toEqual(["archive", "images", "featured"])
      expect(structure.data.memberships.map((membership) => membership.assetId)).toEqual(["asset-2"])
      expect(repository.structureFolderDelete("project-1", root.data.id)).toMatchObject({ success: true })
      expect(repository.structureFolderDelete("project-1", archive.data.id)).toMatchObject({ success: true })
      expect(repository.structureFoldersRead("project-1")).toEqual({ success: true, data: [] })
      expect(repository.assetStructureFolderMembershipsRead("project-1")).toEqual({ success: true, data: [] })
    } finally {
      databaseClose(connection)
    }
  })
})
