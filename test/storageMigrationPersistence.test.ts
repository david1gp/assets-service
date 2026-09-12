import { expect, test } from "bun:test"
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectStorageDomainTable } from "../src/infrastructure/db/schema/projectStorageDomainTable.js"
import { projectStorageLocationTable } from "../src/infrastructure/db/schema/projectStorageLocationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { storageMigrationTable } from "../src/migration/storageMigrationTable.js"

const now = "2026-09-01T00:00:00.000Z"

type MigrationJournal = {
  entries: Array<{ idx: number }>
  [key: string]: unknown
}

const legacyMigrationFolderCreate = (lastMigrationIndex = 13) => {
  const sourceFolder = resolve("drizzle")
  const migrationFolder = mkdtempSync(join(tmpdir(), "assets-storage-migration-"))
  const metaFolder = join(migrationFolder, "meta")
  mkdirSync(metaFolder)
  for (const filename of readdirSync(sourceFolder)) {
    const migrationNumber = Number.parseInt(filename.slice(0, 4), 10)
    if (filename.endsWith(".sql") && migrationNumber <= lastMigrationIndex)
      copyFileSync(join(sourceFolder, filename), join(migrationFolder, filename))
  }
  const journal = JSON.parse(readFileSync(join(sourceFolder, "meta", "_journal.json"), "utf8")) as MigrationJournal
  journal.entries = journal.entries.filter((entry) => entry.idx <= lastMigrationIndex)
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

test("adds a retry attempt column and preserves the active-migration index when upgrading", () => {
  const migrationFolder = legacyMigrationFolderCreate(16)
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) {
    rmSync(migrationFolder, { recursive: true, force: true })
    return
  }

  try {
    expect(databaseMigrate(opened.data, migrationFolder)).toEqual({ success: true, data: null })
    const before = opened.data.client.query("PRAGMA table_info(storage_migrations)").all() as Array<{ name: string }>
    expect(before.some((column) => column.name === "attempt")).toBe(false)

    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    const columns = opened.data.client.query("PRAGMA table_info(storage_migrations)").all() as Array<{
      name: string
      notnull: number
      dflt_value: string | null
    }>
    expect(columns.find((column) => column.name === "attempt")).toMatchObject({ notnull: 1, dflt_value: "1" })

    const indexes = opened.data.client.query("PRAGMA index_list(storage_migrations)").all() as Array<{
      name: string
      unique: number
    }>
    expect(indexes.find((index) => index.name === "storage_migrations_environment_idempotency_unique")).toBeUndefined()
    expect(
      indexes.find((index) => index.name === "storage_migrations_environment_idempotency_attempt_unique"),
    ).toMatchObject({
      unique: 1,
    })
    expect(indexes.find((index) => index.name === "storage_migrations_environment_active_unique")).toMatchObject({
      unique: 1,
    })
  } finally {
    databaseClose(opened.data)
    rmSync(migrationFolder, { recursive: true, force: true })
  }
})

test("backfills current environments and storage migration binding snapshots into the project location ledger", () => {
  const migrationFolder = legacyMigrationFolderCreate(21)
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
        id: "org-storage-ledger",
        name: "Storage ledger",
        slug: "storage-ledger",
        createdAt: now,
        updatedAt: now,
      }),
      databaseRecordInsert(opened.data.db, projectTable, {
        id: "project-storage-ledger",
        organizationId: "org-storage-ledger",
        name: "Storage ledger",
        slug: "storage-ledger",
        defaultEnvironment: "development",
        createdAt: now,
        updatedAt: now,
      }),
      databaseRecordInsert(opened.data.db, environmentTable, {
        id: "environment-storage-ledger",
        projectId: "project-storage-ledger",
        name: "development",
        r2Bucket: "current-bucket",
        r2Prefix: "/",
        publicBaseUrl: "https://current.example.test",
        createdAt: now,
        updatedAt: now,
      }),
      databaseRecordInsert(opened.data.db, storageMigrationTable, {
        id: "storage-migration-ledger",
        projectId: "project-storage-ledger",
        environmentId: "environment-storage-ledger",
        idempotencyKey: "ledger-backfill",
        attempt: 1,
        sourceBinding: {
          projectId: "project-storage-ledger",
          environmentId: "environment-storage-ledger",
          environment: "development",
          bucket: "source-bucket",
          prefix: "/legacy/",
          publicBaseUrl: "https://source.example.test",
        },
        targetBinding: {
          projectId: "project-storage-ledger",
          environmentId: "environment-storage-ledger",
          environment: "development",
          bucket: "target-bucket",
          prefix: "/",
          publicBaseUrl: "https://target.example.test",
        },
        status: "succeeded",
        progress: {
          phase: "completed",
          totalObjects: 0,
          discoveredObjects: 0,
          copiedObjects: 0,
          verifiedObjects: 0,
          totalBytes: 0,
          copiedBytes: 0,
          currentObjectKey: null,
        },
        sourceInventoryFingerprint: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        completedAt: now,
      }),
    ]) {
      if (!result.success) throw new Error(result.errorMessage)
    }

    opened.data.client
      .prepare(
        "UPDATE storage_migrations SET source_binding = json_set(source_binding, '$.customDomain', ?, '$.zoneId', ?), target_binding = json_set(target_binding, '$.customDomain', ?, '$.zoneId', ?) WHERE id = ?",
      )
      .run("source.example.test", "zone-source", "target.example.test", "zone-target", "storage-migration-ledger")

    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    const locations = opened.data.db
      .select()
      .from(projectStorageLocationTable)
      .all()
      .sort((left, right) => left.bucket.localeCompare(right.bucket))
    expect(locations).toHaveLength(3)
    expect(
      locations.map(({ projectId, environment, bucket, prefix }) => ({ projectId, environment, bucket, prefix })),
    ).toEqual([
      { projectId: "project-storage-ledger", environment: "development", bucket: "current-bucket", prefix: "" },
      { projectId: "project-storage-ledger", environment: "development", bucket: "source-bucket", prefix: "legacy" },
      { projectId: "project-storage-ledger", environment: "development", bucket: "target-bucket", prefix: "" },
    ])
    expect(
      opened.data.db
        .select()
        .from(projectStorageDomainTable)
        .all()
        .map(({ projectId, bucket, customDomain, zoneId }) => ({ projectId, bucket, customDomain, zoneId }))
        .sort((left, right) => left.bucket.localeCompare(right.bucket)),
    ).toEqual([
      {
        projectId: "project-storage-ledger",
        bucket: "source-bucket",
        customDomain: "source.example.test",
        zoneId: "zone-source",
      },
      {
        projectId: "project-storage-ledger",
        bucket: "target-bucket",
        customDomain: "target.example.test",
        zoneId: "zone-target",
      },
    ])
  } finally {
    databaseClose(opened.data)
    rmSync(migrationFolder, { recursive: true, force: true })
  }
})
