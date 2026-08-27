import { describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"

import { sqliteSnapshotCreate } from "../src/backup/sqliteSnapshotCreate.js"
import { sqliteSnapshotReceiptRead } from "../src/backup/sqliteSnapshotReceiptRead.js"
import { sqliteSnapshotRestore } from "../src/backup/sqliteSnapshotRestore.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { reconciliationPlanBuild } from "../src/reconciliation/reconciliationPlanBuild.js"
import { reconciliationServiceCreate } from "../src/reconciliation/reconciliationServiceCreate.js"
import type { Result } from "../src/schemas/resultSchema.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import { storagePutImmutable } from "../src/storage/storagePutImmutable.js"

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

  test("lists bucket-root objects when an environment has no R2 prefix", async () => {
    const opened = databaseOpen(":memory:")
    expect(opened.success).toBe(true)
    if (!opened.success) return
    try {
      expect(databaseMigrate(opened.data).success).toBe(true)
      for (const record of [
        databaseRecordInsert(opened.data.db, organizationTable, {
          id: "org-root-reconcile",
          name: "Root reconciliation",
          slug: "root-reconciliation",
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(opened.data.db, projectTable, {
          id: "project-root-reconcile",
          organizationId: "org-root-reconcile",
          name: "Root reconciliation",
          slug: "root-reconciliation",
          defaultEnvironment: "development",
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(opened.data.db, environmentTable, {
          id: "environment-root-reconcile",
          projectId: "project-root-reconcile",
          name: "development",
          r2Bucket: "assets-root-reconcile",
          r2Prefix: "",
          publicBaseUrl: "https://root-reconcile.example.test",
          createdAt: now,
          updatedAt: now,
        }),
      ]) {
        expect(record.success).toBe(true)
      }
      const binding = {
        projectId: "project-root-reconcile",
        environment: "development" as const,
        bucket: "assets-root-reconcile",
        prefix: "",
        publicBaseUrl: "https://root-reconcile.example.test",
      }
      const location = storageObjectLocationCreate(binding, "public-output", "images/root_v1.png")
      expect(location).toMatchObject({ success: true, data: { objectKey: "public/images/root_v1.png" } })
      if (!location.success) return
      const base = memoryStorageAdapterCreate()
      expect(
        await storagePutImmutable(base, {
          location: location.data,
          bytes: new Uint8Array([1]),
          mediaType: "image/png",
        }),
      ).toMatchObject({
        success: true,
      })
      const listInputs: Array<Parameters<NonNullable<typeof base.listObjects>>[0]> = []
      const storage = {
        ...base,
        listObjects: async (input: Parameters<NonNullable<typeof base.listObjects>>[0]) => {
          listInputs.push(input)
          return (
            base.listObjects?.(input) ?? { success: true as const, data: { objects: [], nextContinuationToken: null } }
          )
        },
      }
      const planned = await reconciliationServiceCreate({ db: opened.data.db, storage }).plan({ now })
      expect(planned).toMatchObject({ success: true })
      expect(listInputs).toEqual([{ bucket: "assets-root-reconcile", continuationToken: undefined, maxKeys: 1000 }])
      expect(planned).toMatchObject({
        success: true,
        data: {
          items: [{ objectKey: "public/images/root_v1.png", kind: "public", action: "retain" }],
        },
      })
    } finally {
      databaseClose(opened.data)
    }
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
        prefix: "",
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
      expect(receipt.remoteObjectKey).toBe("private/source/database/snapshots/current.sqlite")
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
              objectKey: "private/source/unknown.bin",
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
