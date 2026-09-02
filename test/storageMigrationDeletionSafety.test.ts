import { describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"

import { sqliteSnapshotCreate } from "../src/backup/sqliteSnapshotCreate.js"
import { deletionApiRepositoryCreate } from "../src/deletion/deletionApiRepositoryCreate.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { deletionStateTable } from "../src/infrastructure/db/schema/deletionStateTable.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { storageMigrationTable } from "../src/migration/storageMigrationTable.js"
import { storageMigrationWorkflowEnqueue } from "../src/migration/storageMigrationWorkflowEnqueue.js"
import { reconciliationServiceCreate } from "../src/reconciliation/reconciliationServiceCreate.js"

const now = "2026-09-01T00:00:00.000Z"
const sourceBinding = {
  projectId: "project-safety",
  environmentId: "environment-safety",
  environment: "development" as const,
  bucket: "source-bucket",
  prefix: "source-prefix",
  publicBaseUrl: "https://source.example.test",
}
const targetBinding = { ...sourceBinding, bucket: "target-bucket", prefix: "target-prefix" }

async function fixtureCreate() {
  await mkdir("data", { recursive: true })
  const databasePath = `data/storage-migration-deletion-safety-${crypto.randomUUID()}.sqlite`
  const first = databaseOpen(databasePath)
  if (!first.success) throw new Error(first.errorMessage)
  const migrated = databaseMigrate(first.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  const db = first.data.db
  for (const result of [
    databaseRecordInsert(db, organizationTable, {
      id: "organization-safety",
      name: "Safety",
      slug: "safety",
      createdAt: now,
      updatedAt: now,
    }),
    databaseRecordInsert(db, projectTable, {
      id: sourceBinding.projectId,
      organizationId: "organization-safety",
      name: "Safety",
      slug: "safety",
      defaultEnvironment: "development",
      createdAt: now,
      updatedAt: now,
    }),
    databaseRecordInsert(db, environmentTable, {
      id: sourceBinding.environmentId,
      projectId: sourceBinding.projectId,
      name: sourceBinding.environment,
      r2Bucket: sourceBinding.bucket,
      r2Prefix: sourceBinding.prefix,
      publicBaseUrl: sourceBinding.publicBaseUrl,
      createdAt: now,
      updatedAt: now,
    }),
  ]) {
    if (!result.success) throw new Error(result.errorMessage)
  }
  const asset = databaseTransactionRun(db, (transaction) => {
    const insertedAsset = databaseRecordInsert(transaction, assetTable, {
      id: "asset-safety",
      projectId: sourceBinding.projectId,
      class: "image",
      folder1: null,
      folder2: null,
      folder3: null,
      filename: "safety.png",
      basename: "safety",
      currentSourceRevisionId: "source-safety",
      integrationNote: null,
      createdAt: now,
      updatedAt: now,
    })
    if (!insertedAsset.success) return insertedAsset
    return databaseRecordInsert(transaction, sourceRevisionTable, {
      id: "source-safety",
      assetId: "asset-safety",
      revision: 1,
      class: "image",
      originalFilename: "safety.png",
      mediaType: "image/png",
      byteSize: 1,
      sha256: "a".repeat(64),
      objectKey: "sources/safety.png",
      createdAt: now,
    })
  })
  if (!asset.success) throw new Error(asset.errorMessage)
  const second = databaseOpen(databasePath)
  if (!second.success) throw new Error(second.errorMessage)
  return { databasePath, first: first.data, second: second.data }
}

async function fixtureDelete(fixture: Awaited<ReturnType<typeof fixtureCreate>>) {
  databaseClose(fixture.second)
  databaseClose(fixture.first)
  await Promise.all(
    [fixture.databasePath, `${fixture.databasePath}-wal`, `${fixture.databasePath}-shm`].map((path) =>
      rm(path, { force: true }),
    ),
  )
}

const migrationInput = {
  projectId: sourceBinding.projectId,
  environmentId: sourceBinding.environmentId,
  idempotencyKey: "migration-safety",
  sourceBinding,
  targetBinding,
}

describe("storage migration and deletion admission", () => {
  test("admits only deletion when the two connections race with deletion first", async () => {
    const fixture = await fixtureCreate()
    try {
      const [deletion, migration] = await Promise.all([
        Promise.resolve().then(() =>
          deletionApiRepositoryCreate(fixture.first.db).deletionRequestEnqueue(sourceBinding.projectId, "asset-safety"),
        ),
        Promise.resolve().then(() => storageMigrationWorkflowEnqueue(fixture.second.db, migrationInput)),
      ])

      expect(deletion).toMatchObject({ success: true })
      expect(migration).toMatchObject({ success: false })
      expect(fixture.first.db.select().from(storageMigrationTable).all()).toHaveLength(0)
      expect(
        fixture.first.db
          .select()
          .from(workflowTable)
          .all()
          .filter((workflow) => workflow.status === "queued" || workflow.status === "running"),
      ).toHaveLength(1)
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("admits only migration when the two connections race with migration first", async () => {
    const fixture = await fixtureCreate()
    try {
      const [migration, deletion] = await Promise.all([
        Promise.resolve().then(() => storageMigrationWorkflowEnqueue(fixture.first.db, migrationInput)),
        Promise.resolve().then(() =>
          deletionApiRepositoryCreate(fixture.second.db).deletionRequestEnqueue(
            sourceBinding.projectId,
            "asset-safety",
          ),
        ),
      ])

      expect(migration).toMatchObject({ success: true })
      expect(deletion).toMatchObject({ success: false })
      expect(fixture.first.db.select().from(storageMigrationTable).all()).toHaveLength(1)
      expect(fixture.first.db.select().from(deletionStateTable).all()).toHaveLength(0)
      expect(
        fixture.first.db
          .select()
          .from(workflowTable)
          .all()
          .filter((workflow) => workflow.status === "queued" || workflow.status === "running"),
      ).toHaveLength(1)
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("does not perform R2 deletion after a migration is admitted on another connection", async () => {
    const fixture = await fixtureCreate()
    const snapshotPath = `${fixture.databasePath}.snapshot.sqlite`
    const receiptPath = `${fixture.databasePath}.receipt.json`
    const snapshotStorage = memoryStorageAdapterCreate()
    try {
      const receipt = await sqliteSnapshotCreate({
        databasePath: fixture.databasePath,
        snapshotPath,
        receiptPath,
        remoteObjectKey: "reconcile.sqlite",
        binding: {
          projectId: sourceBinding.projectId,
          environment: sourceBinding.environment,
          bucket: sourceBinding.bucket,
          prefix: sourceBinding.prefix,
          publicBaseUrl: sourceBinding.publicBaseUrl,
        },
        storage: snapshotStorage,
        now: new Date(now),
      })
      expect(receipt).toMatchObject({ success: true })
      if (!receipt.success) return

      const admitted = storageMigrationWorkflowEnqueue(fixture.second.db, {
        ...migrationInput,
        idempotencyKey: "migration-before-reconcile",
      })
      expect(admitted).toMatchObject({ success: true })

      let deleteCalls = 0
      const service = reconciliationServiceCreate({
        db: fixture.first.db,
        storage: {
          ...snapshotStorage,
          deleteObject: async (location) => {
            deleteCalls += 1
            return snapshotStorage.deleteObject(location)
          },
        },
        databasePath: fixture.databasePath,
      })
      const result = await service.apply({
        plan: {
          schema: "assets.reconciliation-plan.v1",
          id: "reconcile-migration-admission",
          generatedAt: now,
          dryRun: true,
          requiresVerifiedBackup: true,
          items: [
            {
              id: "reconcile-item",
              bucket: sourceBinding.bucket,
              objectKey: `${sourceBinding.prefix}/public/orphan.png`,
              kind: "public",
              action: "delete",
              reason: "unreferenced_public_output",
              ownershipRecordId: "blob-orphan",
              ownershipVerified: true,
              lastModified: now,
            },
          ],
        },
        backupReceipt: receipt.data,
        confirm: true,
        now,
      })
      expect(result).toMatchObject({ success: false })
      expect(deleteCalls).toBe(0)
    } finally {
      await fixtureDelete(fixture)
      await Promise.all(
        [snapshotPath, receiptPath, `${snapshotPath}-wal`, `${snapshotPath}-shm`].map((path) =>
          rm(path, { force: true }),
        ),
      )
    }
  })
})
