import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { expect, test } from "bun:test"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"

const now = "2026-09-01T00:00:00.000Z"

type MigrationJournal = {
  entries: Array<{ idx: number }>
  [key: string]: unknown
}

const legacyMigrationFolderCreate = () => {
  const sourceFolder = resolve("drizzle")
  const migrationFolder = mkdtempSync(join(tmpdir(), "assets-storage-migration-"))
  const metaFolder = join(migrationFolder, "meta")
  mkdirSync(metaFolder)
  for (const filename of readdirSync(sourceFolder)) {
    const migrationNumber = Number.parseInt(filename.slice(0, 4), 10)
    if (filename.endsWith(".sql") && migrationNumber <= 13)
      copyFileSync(join(sourceFolder, filename), join(migrationFolder, filename))
  }
  const journal = JSON.parse(readFileSync(join(sourceFolder, "meta", "_journal.json"), "utf8")) as MigrationJournal
  journal.entries = journal.entries.filter((entry) => entry.idx <= 13)
  writeFileSync(join(metaFolder, "_journal.json"), JSON.stringify(journal))
  return migrationFolder
}

test("accepts legacy workflow rows when applying the storage migration workflow schema migration", () => {
  const migrationFolder = legacyMigrationFolderCreate()
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) {
    rmSync(migrationFolder, { recursive: true, force: true })
    return
  }

  try {
    expect(databaseMigrate(opened.data, migrationFolder)).toEqual({ success: true, data: null })
    for (const result of [
      databaseRecordInsert(opened.data.db, organizationTable, {
        id: "org-legacy-workflow",
        name: "Legacy workflow",
        slug: "legacy-workflow",
        createdAt: now,
        updatedAt: now,
      }),
      databaseRecordInsert(opened.data.db, projectTable, {
        id: "project-legacy-workflow",
        organizationId: "org-legacy-workflow",
        name: "Legacy workflow",
        slug: "legacy-workflow",
        defaultEnvironment: "development",
        createdAt: now,
        updatedAt: now,
      }),
    ]) {
      if (!result.success) throw new Error(result.errorMessage)
    }

    const assetAndSource = databaseTransactionRun(opened.data.db, (transaction) => {
      const asset = databaseRecordInsert(transaction, assetTable, {
        id: "asset-legacy-workflow",
        projectId: "project-legacy-workflow",
        class: "image",
        folder1: null,
        folder2: null,
        folder3: null,
        filename: "legacy.jpg",
        basename: "legacy",
        currentSourceRevisionId: "source-legacy-workflow",
        integrationNote: null,
        createdAt: now,
        updatedAt: now,
      })
      if (!asset.success) return asset
      return databaseRecordInsert(transaction, sourceRevisionTable, {
        id: "source-legacy-workflow",
        assetId: "asset-legacy-workflow",
        revision: 1,
        class: "image",
        originalFilename: "legacy.jpg",
        mediaType: "image/jpeg",
        byteSize: 1,
        sha256: "a".repeat(64),
        objectKey: "sources/asset-legacy-workflow/legacy.jpg",
        createdAt: now,
      })
    })
    if (!assetAndSource.success) throw new Error(assetAndSource.errorMessage)
    const workflow = databaseRecordInsert(opened.data.db, workflowTable, {
      id: "workflow-legacy",
      projectId: "project-legacy-workflow",
      assetId: "asset-legacy-workflow",
      kind: "asset_processing",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    })
    if (!workflow.success) throw new Error(workflow.errorMessage)

    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    expect(opened.data.db.select().from(workflowTable).all()).toMatchObject([
      {
        id: "workflow-legacy",
        projectId: "project-legacy-workflow",
        assetId: "asset-legacy-workflow",
        kind: "asset_processing",
        status: "queued",
      },
    ])
    expect(opened.data.client.query("PRAGMA foreign_key_check").all()).toEqual([])
  } finally {
    databaseClose(opened.data)
    rmSync(migrationFolder, { recursive: true, force: true })
  }
})
