import { describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"

import { sqliteSnapshotCreate } from "../src/backup/sqliteSnapshotCreate.js"
import { sqliteSnapshotReceiptRead } from "../src/backup/sqliteSnapshotReceiptRead.js"
import { sqliteSnapshotRestore } from "../src/backup/sqliteSnapshotRestore.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { reconciliationPlanBuild } from "../src/reconciliation/reconciliationPlanBuild.js"
import { reconciliationServiceCreate } from "../src/reconciliation/reconciliationServiceCreate.js"
import type { Result } from "../src/schemas/resultSchema.js"

const now = "2026-08-17T00:00:00.000Z"

const resultDataRead = <T>(result: Result<T>): T => {
  if (!result.success) throw new Error(`${result.op}: ${result.errorMessage}`)
  return result.data
}

describe("operations", () => {
  test("creates a dry-run plan that never deletes an unknown object", () => {
    const plan = resultDataRead(
      reconciliationPlanBuild({
        now,
        minimumAgeMs: 60_000,
        objects: [
          {
            bucket: "assets",
            objectKey: "project/private/source/orphan.bin",
            lastModified: "2026-08-16T00:00:00.000Z",
          },
          {
            bucket: "assets",
            objectKey: "project/private/source/unknown.bin",
            lastModified: "2026-08-16T00:00:00.000Z",
          },
        ],
        ownership: [
          {
            recordId: "blob-orphan",
            bucket: "assets",
            objectKey: "project/private/source/orphan.bin",
            kind: "private",
            verifiedOwnership: true,
            eligibleForDeletion: true,
            reason: "unreferenced_private_output_with_public_copy",
          },
        ],
      }),
    )
    expect(plan.dryRun).toBe(true)
    expect(plan.items.find((item) => item.objectKey.endsWith("orphan.bin"))?.action).toBe("delete")
    expect(plan.items.find((item) => item.objectKey.endsWith("unknown.bin"))).toMatchObject({
      action: "retain",
      ownershipVerified: false,
      reason: "unknown_object_no_verified_owner",
    })
  })

  test("backs up a WAL database to private storage and verifies restore", async () => {
    await mkdir("data", { recursive: true })
    const suffix = crypto.randomUUID()
    const databasePath = `data/operations-${suffix}.sqlite`
    const snapshotPath = `data/operations-${suffix}.snapshot.sqlite`
    const receiptPath = `data/operations-${suffix}.receipt.json`
    const restoredPath = `data/operations-${suffix}.restored.sqlite`
    const opened = databaseOpen(databasePath)
    expect(opened.success).toBe(true)
    if (!opened.success) return
    try {
      expect(databaseMigrate(opened.data).success).toBe(true)
      const storage = memoryStorageAdapterCreate()
      const binding = {
        projectId: "project-operations",
        environment: "development" as const,
        bucket: "private-assets",
        prefix: "project-operations",
        publicBaseUrl: "https://assets.example.test",
      }
      const receipt = resultDataRead(
        await sqliteSnapshotCreate({
          databasePath,
          snapshotPath,
          receiptPath,
          remoteObjectKey: "database/snapshots/current.sqlite",
          binding,
          storage,
          id: "sqlite-backup-idempotent",
          now: new Date(now),
        }),
      )
      expect(receipt.backupMethod).toBe("sqlite-online-backup")
      const repeated = resultDataRead(
        await sqliteSnapshotCreate({
          databasePath,
          snapshotPath,
          receiptPath,
          remoteObjectKey: "database/snapshots/current.sqlite",
          binding,
          storage,
          id: "sqlite-backup-idempotent",
          now: new Date(now),
        }),
      )
      expect(repeated.id).toBe(receipt.id)
      expect(resultDataRead(await sqliteSnapshotReceiptRead(receiptPath)).sha256).toBe(receipt.sha256)
      const service = reconciliationServiceCreate({ db: opened.data.db, storage, databasePath })
      const unknownPlan = resultDataRead(
        await service.plan({
          now,
          objects: [
            {
              bucket: "private-assets",
              objectKey: "project-operations/private/source/unknown.bin",
              lastModified: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      )
      const applied = resultDataRead(await service.apply({ plan: unknownPlan, backupReceipt: receipt, confirm: true }))
      expect(applied.deletedObjectKeys).toHaveLength(0)
      expect(
        resultDataRead(
          await sqliteSnapshotRestore({
            receipt,
            targetPath: restoredPath,
            snapshotPath,
            storage,
            binding,
          }),
        ),
      ).toBeNull()
      const restored = databaseOpen(restoredPath)
      expect(restored.success).toBe(true)
      if (restored.success) databaseClose(restored.data)
    } finally {
      databaseClose(opened.data)
      await Promise.all(
        [
          databasePath,
          snapshotPath,
          receiptPath,
          restoredPath,
          `${databasePath}-wal`,
          `${databasePath}-shm`,
          `${restoredPath}-wal`,
          `${restoredPath}-shm`,
        ].map((path) => rm(path, { force: true })),
      )
    }
  })
})
