import { describe, expect, test } from "bun:test"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../src/infrastructure/db/schema/outputVersionTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { outputVersionRepositoryAllocate } from "../src/output/outputVersionRepositoryAllocate.js"

describe("output version allocation", () => {
  test("allocates immutable versions and reuses unchanged bytes transactionally", () => {
    const opened = databaseOpen(":memory:")
    expect(opened.success).toBe(true)
    if (!opened.success) return

    try {
      expect(databaseMigrate(opened.data).success).toBe(true)
      expect(
        databaseRecordInsert(opened.data.db, organizationTable, {
          id: "org-versions",
          name: "Versions",
          slug: "versions",
          createdAt: "2026-08-17T00:00:00.000Z",
          updatedAt: "2026-08-17T00:00:00.000Z",
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(opened.data.db, projectTable, {
          id: "project-versions",
          organizationId: "org-versions",
          name: "Versions",
          slug: "versions",
          defaultEnvironment: "development",
          createdAt: "2026-08-17T00:00:00.000Z",
          updatedAt: "2026-08-17T00:00:00.000Z",
        }).success,
      ).toBe(true)

      const seeded = databaseTransactionRun(opened.data.db, (transaction) => {
        const asset = databaseRecordInsert(transaction, assetTable, {
          id: "asset-versions",
          projectId: "project-versions",
          class: "image",
          folder1: "home",
          folder2: null,
          folder3: null,
          filename: "hero.jpg",
          basename: "hero",
          currentSourceRevisionId: "source-versions",
          integrationNote: "",
          createdAt: "2026-08-17T00:00:00.000Z",
          updatedAt: "2026-08-17T00:00:00.000Z",
        })
        if (!asset.success) return asset
        return databaseRecordInsert(transaction, sourceRevisionTable, {
          id: "source-versions",
          assetId: "asset-versions",
          revision: 1,
          class: "image",
          originalFilename: "hero.jpg",
          mediaType: "image/jpeg",
          byteSize: 5,
          sha256: "a".repeat(64),
          objectKey: "sources/asset-versions/v1/hero.jpg",
          createdAt: "2026-08-17T00:00:00.000Z",
        })
      })
      expect(seeded.success).toBe(true)
      expect(
        databaseRecordInsert(opened.data.db, sourceRevisionTable, {
          id: "source-versions-new",
          assetId: "asset-versions",
          revision: 2,
          class: "image",
          originalFilename: "hero.jpg",
          mediaType: "image/jpeg",
          byteSize: 6,
          sha256: "b".repeat(64),
          objectKey: "sources/asset-versions/v2/hero.jpg",
          createdAt: "2026-08-17T00:00:00.000Z",
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(opened.data.db, outputDefinitionTable, {
          id: "output-versions",
          assetId: "asset-versions",
          kind: "image",
          key: "default",
          width: 100,
          height: 50,
          format: "webp",
          quality: 80,
          showAiLabel: null,
          createdAt: "2026-08-17T00:00:00.000Z",
          updatedAt: "2026-08-17T00:00:00.000Z",
        }).success,
      ).toBe(true)

      const first = outputVersionRepositoryAllocate(opened.data.db, {
        id: "version-1",
        outputDefinitionId: "output-versions",
        assetId: "asset-versions",
        sourceRevisionId: "source-versions",
        byteSize: 5,
        sha256: "a".repeat(64),
        mediaType: "image/webp",
        extension: "webp",
        toolchainVersion: "test",
        width: 100,
        height: 50,
        createdAt: "2026-08-17T00:00:00.000Z",
        objectKeyCreate: (version) => `images/home/hero_default_v${version}.webp`,
      })
      expect(first).toMatchObject({ success: true, data: { outcome: "allocated", record: { version: 1 } } })

      const reused = outputVersionRepositoryAllocate(opened.data.db, {
        id: "version-unused",
        outputDefinitionId: "output-versions",
        assetId: "asset-versions",
        sourceRevisionId: "source-versions",
        byteSize: 5,
        sha256: "a".repeat(64),
        mediaType: "image/webp",
        extension: "webp",
        toolchainVersion: "test",
        width: 100,
        height: 50,
        createdAt: "2026-08-17T00:00:00.000Z",
        objectKeyCreate: (version) => `images/home/hero_default_v${version}.webp`,
      })
      expect(reused).toMatchObject({
        success: true,
        data: { outcome: "reused", record: { version: 1, current: true } },
      })

      const changed = outputVersionRepositoryAllocate(opened.data.db, {
        id: "version-2",
        outputDefinitionId: "output-versions",
        assetId: "asset-versions",
        sourceRevisionId: "source-versions",
        byteSize: 6,
        sha256: "b".repeat(64),
        mediaType: "image/webp",
        extension: "webp",
        toolchainVersion: "test",
        width: 100,
        height: 50,
        createdAt: "2026-08-17T00:00:00.000Z",
        objectKeyCreate: (version) => `images/home/hero_default_v${version}.webp`,
      })
      expect(changed).toMatchObject({ success: true, data: { outcome: "allocated", record: { version: 2 } } })
      expect(opened.data.db.select().from(outputVersionTable).all()).toHaveLength(2)
      expect(
        opened.data.db
          .select()
          .from(outputVersionTable)
          .all()
          .map((version) => version.current),
      ).toEqual([false, true])

      const moved = outputVersionRepositoryAllocate(opened.data.db, {
        id: "version-move",
        outputDefinitionId: "output-versions",
        assetId: "asset-versions",
        sourceRevisionId: "source-versions",
        byteSize: 6,
        sha256: "b".repeat(64),
        mediaType: "image/webp",
        extension: "webp",
        toolchainVersion: "test",
        width: 100,
        height: 50,
        createdAt: "2026-08-17T00:00:00.000Z",
        forceNewVersion: true,
        objectKeyCreate: (version) => `images/landing/hero_default_v${version}.webp`,
      })
      expect(moved).toMatchObject({ success: true, data: { outcome: "allocated", record: { version: 3 } } })
      const sameBytesFromNewSource = outputVersionRepositoryAllocate(opened.data.db, {
        id: "version-new-source",
        outputDefinitionId: "output-versions",
        assetId: "asset-versions",
        sourceRevisionId: "source-versions-new",
        byteSize: 6,
        sha256: "b".repeat(64),
        mediaType: "image/webp",
        extension: "webp",
        toolchainVersion: "test",
        width: 100,
        height: 50,
        createdAt: "2026-08-17T00:00:00.000Z",
        objectKeyCreate: (version) => `images/home/hero_default_v${version}.webp`,
      })
      expect(sameBytesFromNewSource).toMatchObject({
        success: true,
        data: { outcome: "allocated", record: { version: 4, sourceRevisionId: "source-versions-new" } },
      })
      expect(
        outputVersionRepositoryAllocate(opened.data.db, {
          id: "version-move",
          outputDefinitionId: "output-versions",
          assetId: "asset-versions",
          sourceRevisionId: "source-versions",
          byteSize: 6,
          sha256: "b".repeat(64),
          mediaType: "image/webp",
          extension: "webp",
          toolchainVersion: "test",
          width: 100,
          height: 50,
          createdAt: "2026-08-17T00:00:00.000Z",
          forceNewVersion: true,
          objectKeyCreate: (version) => `images/landing/hero_default_v${version}.webp`,
        }),
      ).toMatchObject({ success: true, data: { outcome: "reused", record: { version: 3 } } })
    } finally {
      databaseClose(opened.data)
    }
  })
})
