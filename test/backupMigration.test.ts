import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { rm } from "node:fs/promises"
import { eq } from "drizzle-orm"

import type { AssetDatabase } from "../src/infrastructure/db/assetDatabase.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { backupReceiptTable } from "../src/infrastructure/db/schema/backupReceiptTable.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import type { BackupRemotePathMigrationAdapter } from "../src/migration/backupRemotePathMigrationAdapter.js"
import { backupRemotePathMigrationRunTable } from "../src/migration/backupRemotePathMigrationRunTable.js"
import { backupRemotePathMigrationServiceCreate } from "../src/migration/backupRemotePathMigrationServiceCreate.js"
import { resultErrorCreate } from "../src/schemas/resultErrorCreate.js"

const now = "2026-08-25T00:00:00.000Z"
const bytes = new Uint8Array([1, 2, 3, 4])
const sha256 = createHash("sha256").update(bytes).digest("hex")
const oldRemotePath = "gdrive_beta:backups/adaptive/website/assets/home/legacy/revision-1_hero.png"
const destinationRemotePath = "gdrive_beta:backups/adaptive/website/assets/home/revision-1_hero.png"
const secondOldRemotePath = "gdrive_beta:backups/adaptive/website/assets/about/legacy/revision-2_logo.png"
const secondDestinationRemotePath = "gdrive_beta:backups/adaptive/website/assets/home/revision-2_logo.png"

type MigrationFixture = {
  databasePath: string
  db: AssetDatabase
  close: () => void
}

function fakeAdapterCreate(
  objects: Map<string, Uint8Array>,
  options: { failDestinationVerificationOnce?: boolean; failDestinationPath?: string } = {},
) {
  let failDestinationVerificationOnce = options.failDestinationVerificationOnce ?? false
  const failDestinationPath = options.failDestinationPath ?? destinationRemotePath
  let copyCount = 0
  const adapter: BackupRemotePathMigrationAdapter = {
    remoteObjectVerify: async ({ remotePath, expectedByteSize, expectedSha256 }) => {
      const object = objects.get(remotePath)
      if (object === undefined) return { success: true, data: "missing" }
      if (remotePath === failDestinationPath && failDestinationVerificationOnce) {
        failDestinationVerificationOnce = false
        return { success: true, data: "mismatch" }
      }
      const digest = createHash("sha256").update(object).digest("hex")
      return object.byteLength === expectedByteSize && digest === expectedSha256
        ? { success: true, data: "verified" }
        : { success: true, data: "mismatch" }
    },
    remoteObjectCopyImmutable: async ({ sourceRemotePath, destinationRemotePath: destination }) => {
      copyCount += 1
      const source = objects.get(sourceRemotePath)
      if (source === undefined) return resultErrorCreate("fakeMigrationAdapter", "source object is missing")
      const existing = objects.get(destination)
      if (existing?.some((value, index) => value !== source[index]))
        return resultErrorCreate("fakeMigrationAdapter", "immutable destination collision")
      objects.set(destination, new Uint8Array(source))
      return { success: true, data: null }
    },
  }
  return { adapter, copyCountRead: () => copyCount }
}

async function fixtureCreate(): Promise<MigrationFixture> {
  const databasePath = `data/backup-migration-${crypto.randomUUID()}.sqlite`
  const opened = databaseOpen(databasePath)
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  const organization = databaseRecordInsert(opened.data.db, organizationTable, {
    id: "org-1",
    name: "Adaptive",
    slug: "adaptive",
    createdAt: now,
    updatedAt: now,
  })
  if (!organization.success) throw new Error(organization.errorMessage)
  const project = databaseRecordInsert(opened.data.db, projectTable, {
    id: "project-1",
    organizationId: "org-1",
    name: "Website",
    slug: "website",
    defaultEnvironment: "production",
    createdAt: now,
    updatedAt: now,
  })
  if (!project.success) throw new Error(project.errorMessage)
  const assetAndSource = databaseTransactionRun(opened.data.db, (transaction) => {
    const asset = databaseRecordInsert(transaction, assetTable, {
      id: "asset-1",
      projectId: "project-1",
      class: "image",
      folder1: "home",
      folder2: null,
      folder3: null,
      filename: "hero.png",
      basename: "hero",
      currentSourceRevisionId: "revision-1",
      integrationNote: null,
      createdAt: now,
      updatedAt: now,
    })
    if (!asset.success) return asset
    return databaseRecordInsert(transaction, sourceRevisionTable, {
      id: "revision-1",
      assetId: "asset-1",
      revision: 1,
      class: "image",
      originalFilename: "hero.png",
      mediaType: "image/png",
      byteSize: bytes.byteLength,
      sha256,
      objectKey: "sources/asset-1/revision-1/hero.png",
      createdAt: now,
    })
  })
  if (!assetAndSource.success) throw new Error(assetAndSource.errorMessage)
  const workflow = databaseRecordInsert(opened.data.db, workflowTable, {
    id: "workflow-1",
    projectId: "project-1",
    assetId: "asset-1",
    sourceRevisionId: "revision-1",
    kind: "asset_processing",
    status: "succeeded",
    createdAt: now,
    updatedAt: now,
  })
  if (!workflow.success) throw new Error(workflow.errorMessage)
  const job = databaseRecordInsert(opened.data.db, jobTable, {
    id: "job-1",
    workflowId: "workflow-1",
    kind: "backup_original",
    status: "succeeded",
    availableAt: now,
    priority: 0,
    attempts: 1,
    retryLimit: 3,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    idempotencyKey: "backup-migration-fixture",
    payloadSchemaVersion: 1,
    payload: { assetId: "asset-1", sourceRevisionId: "revision-1" },
    error: null,
    createdAt: now,
    updatedAt: now,
  })
  if (!job.success) throw new Error(job.errorMessage)
  const receipt = databaseRecordInsert(opened.data.db, backupReceiptTable, {
    id: "receipt-1",
    projectId: "project-1",
    sourceRevisionId: "revision-1",
    jobId: "job-1",
    remotePath: oldRemotePath,
    byteSize: bytes.byteLength,
    sha256,
    checkResult: "verified",
    completedAt: now,
  })
  if (!receipt.success) throw new Error(receipt.errorMessage)
  return { databasePath, db: opened.data.db, close: () => databaseClose(opened.data) }
}

async function fixtureDelete(fixture: MigrationFixture): Promise<void> {
  fixture.close()
  await Promise.all(
    [fixture.databasePath, `${fixture.databasePath}-wal`, `${fixture.databasePath}-shm`].map((path) =>
      rm(path, { force: true }),
    ),
  )
}

function fixtureSecondReceiptInsert(fixture: MigrationFixture): void {
  const sourceRevision = databaseRecordInsert(fixture.db, sourceRevisionTable, {
    id: "revision-2",
    assetId: "asset-1",
    revision: 2,
    class: "image",
    originalFilename: "logo.png",
    mediaType: "image/png",
    byteSize: bytes.byteLength,
    sha256,
    objectKey: "sources/asset-2/revision-2/logo.png",
    createdAt: now,
  })
  if (!sourceRevision.success) throw new Error(sourceRevision.errorMessage)
  const workflow = databaseRecordInsert(fixture.db, workflowTable, {
    id: "workflow-2",
    projectId: "project-1",
    assetId: "asset-1",
    sourceRevisionId: "revision-2",
    kind: "asset_processing",
    status: "succeeded",
    createdAt: now,
    updatedAt: now,
  })
  if (!workflow.success) throw new Error(workflow.errorMessage)
  const job = databaseRecordInsert(fixture.db, jobTable, {
    id: "job-2",
    workflowId: "workflow-2",
    kind: "backup_original",
    status: "succeeded",
    availableAt: now,
    priority: 0,
    attempts: 1,
    retryLimit: 3,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    idempotencyKey: "backup-migration-fixture-2",
    payloadSchemaVersion: 1,
    payload: { assetId: "asset-1", sourceRevisionId: "revision-2" },
    error: null,
    createdAt: now,
    updatedAt: now,
  })
  if (!job.success) throw new Error(job.errorMessage)
  const receipt = databaseRecordInsert(fixture.db, backupReceiptTable, {
    id: "receipt-2",
    projectId: "project-1",
    sourceRevisionId: "revision-2",
    jobId: "job-2",
    remotePath: secondOldRemotePath,
    byteSize: bytes.byteLength,
    sha256,
    checkResult: "verified",
    completedAt: now,
  })
  if (!receipt.success) throw new Error(receipt.errorMessage)
}

describe("backup remote path migration", () => {
  test("dry-runs by default, derives the canonical path from persisted metadata, and resumes idempotently", async () => {
    const fixture = await fixtureCreate()
    const objects = new Map([[oldRemotePath, bytes]])
    const fake = fakeAdapterCreate(objects)
    try {
      const service = backupRemotePathMigrationServiceCreate({
        db: fixture.db,
        adapter: fake.adapter,
        clock: () => new Date(now),
      })
      const planned = await service.migrate()
      expect(planned).toMatchObject({
        success: true,
        data: {
          dryRun: true,
          status: "planned",
          totalReceipts: 1,
          plannedReceiptIds: ["receipt-1"],
          collisions: [],
        },
      })
      expect(objects.has(destinationRemotePath)).toBe(false)
      expect(fixture.db.select().from(backupReceiptTable).get()?.remotePath).toBe(oldRemotePath)

      const applied = await service.migrate({ dryRun: false })
      expect(applied).toMatchObject({
        success: true,
        data: { status: "succeeded", plannedReceiptIds: [], completedReceiptIds: ["receipt-1"] },
      })
      expect(fake.copyCountRead()).toBe(1)
      expect(objects.has(oldRemotePath)).toBe(true)
      expect(objects.has(destinationRemotePath)).toBe(true)
      expect(fixture.db.select().from(backupReceiptTable).get()?.remotePath).toBe(destinationRemotePath)
      expect(fixture.db.select().from(backupRemotePathMigrationRunTable).get()?.status).toBe("succeeded")

      const repeated = await service.migrate({ dryRun: false })
      expect(repeated).toMatchObject({ success: true, data: { status: "succeeded" } })
      expect(fake.copyCountRead()).toBe(1)
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("reports an existing destination collision without copying or changing the receipt", async () => {
    const fixture = await fixtureCreate()
    const objects = new Map([
      [oldRemotePath, bytes],
      [destinationRemotePath, new Uint8Array([9, 9])],
    ])
    const fake = fakeAdapterCreate(objects)
    try {
      const service = backupRemotePathMigrationServiceCreate({
        db: fixture.db,
        adapter: fake.adapter,
        clock: () => new Date(now),
      })
      const planned = await service.migrate()
      expect(planned).toMatchObject({
        success: true,
        data: { dryRun: true, collisions: [{ destination: destinationRemotePath }] },
      })

      const blocked = await service.migrate({ dryRun: false })
      expect(blocked).toMatchObject({
        success: true,
        data: { status: "blocked", collisions: [{ destination: destinationRemotePath }] },
      })
      expect(fake.copyCountRead()).toBe(0)
      expect(fixture.db.select().from(backupReceiptTable).get()?.remotePath).toBe(oldRemotePath)
      expect(fixture.db.select().from(backupRemotePathMigrationRunTable).get()?.status).toBe("blocked")
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("reports a deleted canonical object after a succeeded run instead of short-circuiting", async () => {
    const fixture = await fixtureCreate()
    const objects = new Map([[oldRemotePath, bytes]])
    const fake = fakeAdapterCreate(objects)
    try {
      const service = backupRemotePathMigrationServiceCreate({
        db: fixture.db,
        adapter: fake.adapter,
        clock: () => new Date(now),
      })
      const applied = await service.apply()
      expect(applied.success).toBe(true)
      objects.delete(destinationRemotePath)

      const planned = await service.plan()
      expect(planned).toMatchObject({
        success: true,
        data: {
          status: "planned",
          plannedReceiptIds: [],
          missingItems: [{ destination: destinationRemotePath, receiptIds: ["receipt-1"] }],
        },
      })

      const blocked = await service.apply()
      expect(blocked).toMatchObject({
        success: true,
        data: {
          status: "blocked",
          missingItems: [{ destination: destinationRemotePath, receiptIds: ["receipt-1"] }],
        },
      })
      expect(fixture.db.select().from(backupRemotePathMigrationRunTable).get()?.status).toBe("blocked")
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("retries a receipt reverted after a succeeded run without copying an already verified destination", async () => {
    const fixture = await fixtureCreate()
    const objects = new Map([[oldRemotePath, bytes]])
    const fake = fakeAdapterCreate(objects)
    try {
      const service = backupRemotePathMigrationServiceCreate({
        db: fixture.db,
        adapter: fake.adapter,
        clock: () => new Date(now),
      })
      const applied = await service.apply()
      expect(applied.success).toBe(true)
      fixture.db
        .update(backupReceiptTable)
        .set({ remotePath: oldRemotePath })
        .where(eq(backupReceiptTable.id, "receipt-1"))
        .run()

      const repaired = await service.apply()
      expect(repaired).toMatchObject({
        success: true,
        data: { status: "succeeded", plannedReceiptIds: [], completedReceiptIds: ["receipt-1"], skippedItems: [] },
      })
      expect(fake.copyCountRead()).toBe(1)
      expect(fixture.db.select().from(backupReceiptTable).get()?.remotePath).toBe(destinationRemotePath)
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("fails closed when a verified receipt does not match its source project", async () => {
    const fixture = await fixtureCreate()
    try {
      const project = databaseRecordInsert(fixture.db, projectTable, {
        id: "project-2",
        organizationId: "org-1",
        name: "Other project",
        slug: "other-project",
        defaultEnvironment: "production",
        createdAt: now,
        updatedAt: now,
      })
      expect(project.success).toBe(true)
      fixture.db
        .update(backupReceiptTable)
        .set({ projectId: "project-2" })
        .where(eq(backupReceiptTable.id, "receipt-1"))
        .run()

      const service = backupRemotePathMigrationServiceCreate({
        db: fixture.db,
        adapter: fakeAdapterCreate(new Map([[oldRemotePath, bytes]])).adapter,
        clock: () => new Date(now),
      })
      const planned = await service.plan()
      expect(planned.success).toBe(false)
      if (planned.success) return
      expect(planned.errorMessage).toContain("does not match its source metadata")
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("keeps a running checkpoint after verification failure and restarts without recopying", async () => {
    const fixture = await fixtureCreate()
    const objects = new Map([[oldRemotePath, bytes]])
    const fake = fakeAdapterCreate(objects, { failDestinationVerificationOnce: true })
    try {
      const service = backupRemotePathMigrationServiceCreate({
        db: fixture.db,
        adapter: fake.adapter,
        clock: () => new Date(now),
      })
      const first = await service.migrate({ dryRun: false })
      expect(first.success).toBe(false)
      expect(fake.copyCountRead()).toBe(1)
      expect(fixture.db.select().from(backupRemotePathMigrationRunTable).get()?.status).toBe("running")
      expect(fixture.db.select().from(backupReceiptTable).get()?.remotePath).toBe(oldRemotePath)

      const resumed = await service.migrate({ dryRun: false })
      expect(resumed).toMatchObject({ success: true, data: { status: "succeeded" } })
      expect(fake.copyCountRead()).toBe(1)
      expect(fixture.db.select().from(backupReceiptTable).get()?.remotePath).toBe(destinationRemotePath)
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("resumes a partial multi-item run without changing its fingerprint", async () => {
    const fixture = await fixtureCreate()
    fixtureSecondReceiptInsert(fixture)
    const objects = new Map([
      [oldRemotePath, bytes],
      [secondOldRemotePath, bytes],
    ])
    const fake = fakeAdapterCreate(objects, {
      failDestinationVerificationOnce: true,
      failDestinationPath: secondDestinationRemotePath,
    })
    try {
      const service = backupRemotePathMigrationServiceCreate({
        db: fixture.db,
        adapter: fake.adapter,
        clock: () => new Date(now),
      })
      const first = await service.apply()
      expect(first.success).toBe(false)
      const firstRun = fixture.db.select().from(backupRemotePathMigrationRunTable).get()
      expect(firstRun).toMatchObject({
        status: "running",
        completedReceiptIds: ["receipt-1"],
      })
      if (firstRun === undefined) return
      expect(
        fixture.db
          .select()
          .from(backupReceiptTable)
          .all()
          .map((receipt) => receipt.remotePath),
      ).toEqual([destinationRemotePath, secondOldRemotePath])

      const resumed = await service.apply()
      expect(resumed).toMatchObject({
        success: true,
        data: { status: "succeeded", completedReceiptIds: ["receipt-1", "receipt-2"], skippedItems: [] },
      })
      if (!resumed.success) return
      expect(resumed.data.runId).toBe(firstRun.id)
      expect(resumed.data.fingerprint).toBe(firstRun.fingerprint)
      expect(fake.copyCountRead()).toBe(2)
      expect(fixture.db.select().from(backupRemotePathMigrationRunTable).all()).toHaveLength(1)
      expect(
        fixture.db
          .select()
          .from(backupReceiptTable)
          .all()
          .map((receipt) => receipt.remotePath),
      ).toEqual([destinationRemotePath, secondDestinationRemotePath])
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("blocks when a receipt changes during migration and retries the skipped item", async () => {
    const fixture = await fixtureCreate()
    const changedRemotePath = "gdrive_beta:backups/adaptive/website/assets/home/changed/revision-1_hero.png"
    const objects = new Map([[oldRemotePath, bytes]])
    const fake = fakeAdapterCreate(objects)
    let changed = false
    const adapter: BackupRemotePathMigrationAdapter = {
      remoteObjectVerify: async (input) => {
        if (!changed && input.remotePath === destinationRemotePath) {
          changed = true
          objects.set(changedRemotePath, bytes)
          fixture.db
            .update(backupReceiptTable)
            .set({ remotePath: changedRemotePath })
            .where(eq(backupReceiptTable.id, "receipt-1"))
            .run()
        }
        return fake.adapter.remoteObjectVerify(input)
      },
      remoteObjectCopyImmutable: fake.adapter.remoteObjectCopyImmutable,
    }
    try {
      const service = backupRemotePathMigrationServiceCreate({
        db: fixture.db,
        adapter,
        clock: () => new Date(now),
      })
      const blocked = await service.apply()
      expect(blocked).toMatchObject({
        success: true,
        data: {
          status: "blocked",
          completedReceiptIds: [],
          skippedItems: [{ receiptId: "receipt-1" }],
        },
      })
      expect(fixture.db.select().from(backupRemotePathMigrationRunTable).get()?.status).toBe("blocked")

      const blockedWithoutResume = await service.apply()
      expect(blockedWithoutResume.success).toBe(false)
      if (blockedWithoutResume.success) return
      expect(blockedWithoutResume.errorMessage).toContain("blocked")
      const runId = fixture.db.select().from(backupRemotePathMigrationRunTable).get()?.id
      expect(runId).toBeString()
      if (runId === undefined) return
      const resumed = await service.apply({ runId })
      expect(resumed).toMatchObject({
        success: true,
        data: { status: "succeeded", plannedReceiptIds: [], completedReceiptIds: ["receipt-1"], skippedItems: [] },
      })
      expect(fixture.db.select().from(backupReceiptTable).get()?.remotePath).toBe(destinationRemotePath)
    } finally {
      await fixtureDelete(fixture)
    }
  })
})
