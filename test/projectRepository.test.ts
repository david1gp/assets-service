import { describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import type { InferInsertModel } from "drizzle-orm"
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core"

import type { AssetDatabase } from "../src/infrastructure/db/assetDatabase.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../src/infrastructure/db/schema/outputVersionTable.js"
import { projectBindingTable } from "../src/infrastructure/db/schema/projectBindingTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { projectRepositoryCreate } from "../src/project/projectRepositoryCreate.js"

const timestamp = "2026-08-17T00:00:00.000Z"
const project = {
  id: "project-1",
  organizationId: "org-1",
  name: "Example project",
  slug: "example-project",
  defaultEnvironment: "development" as const,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const databasePathCreate = () => `data/project-repository-${crypto.randomUUID()}.sqlite`

const recordInsertRequired = <TTable extends AnySQLiteTable>(
  db: AssetDatabase,
  table: TTable,
  values: InferInsertModel<TTable>,
) => {
  const inserted = databaseRecordInsert(db, table, values)
  if (!inserted.success) throw new Error(inserted.errorMessage)
}

const repositoryCreate = async () => {
  await mkdir("data", { recursive: true })
  const databasePath = databasePathCreate()
  const opened = databaseOpen(databasePath)
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)

  recordInsertRequired(opened.data.db, organizationTable, {
    id: "org-1",
    name: "Example",
    slug: "example",
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  recordInsertRequired(opened.data.db, projectTable, project)
  recordInsertRequired(opened.data.db, projectBindingTable, {
    id: "binding-1",
    projectId: "project-1",
    organizationId: "org-1",
    zitadelProjectId: "zitadel-1",
    serviceProjectId: "service-project-1",
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  return { databasePath, connection: opened.data, repository: projectRepositoryCreate(opened.data.db) }
}

const cleanup = async (
  databasePath: string,
  connection: Awaited<ReturnType<typeof repositoryCreate>>["connection"],
) => {
  databaseClose(connection)
  await rm(databasePath, { force: true })
  await rm(`${databasePath}-wal`, { force: true })
  await rm(`${databasePath}-shm`, { force: true })
}

describe("projectRepository.projectsRead", () => {
  test("returns zero metrics for a project without assets", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      const listed = repository.projectsRead("org-1", ["zitadel-1"])
      expect(listed.success).toBe(true)
      if (!listed.success) return
      expect(listed.data).toEqual([{ ...project, assetCount: 0, totalFileSize: 0 }])
    } finally {
      await cleanup(databasePath, connection)
    }
  })

  test("counts multiple assets and sums only their current source revisions", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      const assetsAndSources = databaseTransactionRun(connection.db, (transaction) => {
        recordInsertRequired(transaction, assetTable, {
          id: "asset-1",
          projectId: "project-1",
          class: "image",
          folder1: "home",
          folder2: null,
          folder3: null,
          filename: "hero.jpg",
          basename: "hero",
          currentSourceRevisionId: "source-1-v2",
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        recordInsertRequired(transaction, assetTable, {
          id: "asset-2",
          projectId: "project-1",
          class: "font",
          folder1: null,
          folder2: null,
          folder3: null,
          filename: "brand.woff2",
          basename: "brand",
          currentSourceRevisionId: "source-2-v2",
          createdAt: timestamp,
          updatedAt: timestamp,
        })

        recordInsertRequired(transaction, sourceRevisionTable, {
          id: "source-1-v1",
          assetId: "asset-1",
          revision: 1,
          class: "image",
          originalFilename: "hero.jpg",
          mediaType: "image/jpeg",
          byteSize: 10,
          sha256: "a".repeat(64),
          objectKey: "sources/asset-1/v1/hero.jpg",
          createdAt: timestamp,
        })
        recordInsertRequired(transaction, sourceRevisionTable, {
          id: "source-1-v2",
          assetId: "asset-1",
          revision: 2,
          class: "image",
          originalFilename: "hero.jpg",
          mediaType: "image/jpeg",
          byteSize: 20,
          sha256: "b".repeat(64),
          objectKey: "sources/asset-1/v2/hero.jpg",
          createdAt: timestamp,
        })
        recordInsertRequired(transaction, sourceRevisionTable, {
          id: "source-2-v1",
          assetId: "asset-2",
          revision: 1,
          class: "font",
          originalFilename: "brand.woff2",
          mediaType: "font/woff2",
          byteSize: 40,
          sha256: "c".repeat(64),
          objectKey: "sources/asset-2/v1/brand.woff2",
          createdAt: timestamp,
        })
        recordInsertRequired(transaction, sourceRevisionTable, {
          id: "source-2-v2",
          assetId: "asset-2",
          revision: 2,
          class: "font",
          originalFilename: "brand.woff2",
          mediaType: "font/woff2",
          byteSize: 30,
          sha256: "d".repeat(64),
          objectKey: "sources/asset-2/v2/brand.woff2",
          createdAt: timestamp,
        })
        return { success: true, data: null } as const
      })
      if (!assetsAndSources.success) throw new Error(assetsAndSources.errorMessage)

      recordInsertRequired(connection.db, outputDefinitionTable, {
        id: "output-1",
        assetId: "asset-1",
        kind: "image",
        key: "small",
        width: 1,
        height: 1,
        format: "webp",
        quality: null,
        showAiLabel: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      recordInsertRequired(connection.db, outputVersionTable, {
        id: "output-version-1",
        projectId: "project-1",
        outputDefinitionId: "output-1",
        assetId: "asset-1",
        sourceRevisionId: "source-1-v2",
        version: 1,
        byteSize: 900,
        sha256: "e".repeat(64),
        mediaType: "image/webp",
        extension: "webp",
        objectKey: "outputs/asset-1/small.webp",
        toolchainVersion: "test",
        width: 1,
        height: 1,
        current: true,
        createdAt: timestamp,
      })

      const listed = repository.projectsRead("org-1", ["zitadel-1"])
      expect(listed.success).toBe(true)
      if (!listed.success) return
      expect(listed.data[0]).toMatchObject({ assetCount: 2, totalFileSize: 50 })
    } finally {
      await cleanup(databasePath, connection)
    }
  })
})
