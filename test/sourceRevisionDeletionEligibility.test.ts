import { expect, test } from "bun:test"
import { eq } from "drizzle-orm"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { backupReceiptTable } from "../src/infrastructure/db/schema/backupReceiptTable.js"
import { catalogGenerationTable } from "../src/infrastructure/db/schema/catalogGenerationTable.js"
import { catalogOutputTable } from "../src/infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../src/infrastructure/db/schema/catalogTable.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../src/infrastructure/db/schema/outputVersionTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { sourceRevisionDeletionEligibilityRepositoryCreate } from "../src/deletion/sourceRevisionDeletionEligibilityRepositoryCreate.js"

const now = "2026-08-18T00:00:00.000Z"
const sourceRevisionId = "source-eligibility"

test("source revision deletion eligibility proves every current safety condition atomically", () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return

  try {
    expect(databaseMigrate(opened.data).success).toBe(true)
    expect(
      databaseTransactionRun(opened.data.db, (transaction) => {
        for (const tableAndValues of [
          [
            organizationTable,
            { id: "org-eligibility", name: "Eligibility", slug: "eligibility", createdAt: now, updatedAt: now },
          ],
          [
            projectTable,
            {
              id: "project-eligibility",
              organizationId: "org-eligibility",
              name: "Eligibility",
              slug: "eligibility",
              defaultEnvironment: "development",
              createdAt: now,
              updatedAt: now,
            },
          ],
          [
            environmentTable,
            {
              id: "environment-eligibility",
              projectId: "project-eligibility",
              name: "development",
              r2Bucket: "assets",
              r2Prefix: "project-eligibility",
              publicBaseUrl: "https://assets.example.test",
              createdAt: now,
              updatedAt: now,
            },
          ],
        ] as const) {
          const inserted = databaseRecordInsert(transaction, tableAndValues[0], tableAndValues[1] as never)
          if (!inserted.success) return inserted
        }

        const asset = databaseRecordInsert(transaction, assetTable, {
          id: "asset-eligibility",
          projectId: "project-eligibility",
          class: "image",
          folder1: null,
          folder2: null,
          folder3: null,
          filename: "hero.jpg",
          basename: "hero",
          currentSourceRevisionId: sourceRevisionId,
          integrationNote: null,
          createdAt: now,
          updatedAt: now,
        })
        if (!asset.success) return asset
        const source = databaseRecordInsert(transaction, sourceRevisionTable, {
          id: sourceRevisionId,
          assetId: "asset-eligibility",
          revision: 1,
          class: "image",
          originalFilename: "hero.jpg",
          mediaType: "image/jpeg",
          byteSize: 10,
          sha256: "a".repeat(64),
          objectKey: "sources/source-eligibility/hero.jpg",
          createdAt: now,
        })
        if (!source.success) return source
        const definition = databaseRecordInsert(transaction, outputDefinitionTable, {
          id: "output-eligibility",
          assetId: "asset-eligibility",
          kind: "image",
          key: "default",
          width: 100,
          height: 50,
          format: "webp",
          quality: 80,
          showAiLabel: null,
          createdAt: now,
          updatedAt: now,
        })
        if (!definition.success) return definition
        const version = databaseRecordInsert(transaction, outputVersionTable, {
          id: "version-eligibility",
          outputDefinitionId: "output-eligibility",
          assetId: "asset-eligibility",
          sourceRevisionId,
          version: 1,
          byteSize: 20,
          sha256: "b".repeat(64),
          mediaType: "image/webp",
          extension: "webp",
          objectKey: "images/hero.webp",
          toolchainVersion: "test",
          width: 100,
          height: 50,
          current: true,
          createdAt: now,
        })
        if (!version.success) return version
        const workflow = databaseRecordInsert(transaction, workflowTable, {
          id: "workflow-eligibility",
          projectId: "project-eligibility",
          assetId: "asset-eligibility",
          sourceRevisionId,
          kind: "asset_processing",
          status: "succeeded",
          createdAt: now,
          updatedAt: now,
        })
        if (!workflow.success) return workflow
        for (const job of [
          { id: "job-eligibility-backup", kind: "backup_original" as const },
          { id: "job-eligibility-publish", kind: "publish_asset" as const },
        ]) {
          const inserted = databaseRecordInsert(transaction, jobTable, {
            id: job.id,
            workflowId: workflow.data.id,
            kind: job.kind,
            status: "succeeded",
            availableAt: now,
            priority: 0,
            attempts: 1,
            retryLimit: 1,
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            idempotencyKey: job.id,
            payloadSchemaVersion: 1,
            payload: { assetId: "asset-eligibility", sourceRevisionId, environmentId: "environment-eligibility" },
            error: null,
            createdAt: now,
            updatedAt: now,
          })
          if (!inserted.success) return inserted
        }
        const receipt = databaseRecordInsert(transaction, backupReceiptTable, {
          id: "receipt-eligibility",
          projectId: "project-eligibility",
          sourceRevisionId,
          jobId: "job-eligibility-backup",
          remotePath: "gdrive_beta:backups/eligibility/eligibility/assets/source-eligibility_hero.jpg",
          byteSize: 10,
          sha256: "a".repeat(64),
          checkResult: "verified",
          completedAt: now,
        })
        if (!receipt.success) return receipt
        const generation = databaseRecordInsert(transaction, catalogGenerationTable, {
          id: "generation-eligibility",
          projectId: "project-eligibility",
          environment: "development",
          digest: "c".repeat(64),
          manifestObjectKey: "catalogs/development/eligibility.json",
          rendererVersion: "test",
          createdAt: now,
        })
        if (!generation.success) return generation
        const catalogOutput = databaseRecordInsert(transaction, catalogOutputTable, {
          generationId: generation.data.id,
          assetId: "asset-eligibility",
          outputVersionId: "version-eligibility",
          class: "image",
          key: "default",
          property: "hero",
          path: "images/hero.webp",
          metadata: {
            kind: "image",
            width: 100,
            height: 50,
            format: "webp",
            colorSpace: "srgb",
            alpha: false,
            orientationApplied: true,
            frameCount: 1,
            animated: false,
            alt: null,
            aiProvenance: null,
          },
        })
        if (!catalogOutput.success) return catalogOutput
        return databaseRecordInsert(transaction, catalogTable, {
          id: "catalog-eligibility",
          projectId: "project-eligibility",
          environment: "development",
          generationId: generation.data.id,
          schema: "assets.catalog.v1",
          digest: generation.data.digest,
          rendererVersion: "test",
          generatedAt: now,
          updatedAt: now,
        })
      }).success,
    ).toBe(true)

    const repository = sourceRevisionDeletionEligibilityRepositoryCreate(opened.data.db)
    expect(
      repository.sourceRevisionDeletionEligibilityRead("project-eligibility", "development", sourceRevisionId),
    ).toEqual({
      success: true,
      data: {
        sourceRevisionId,
        eligible: true,
        checks: {
          sourceIdentity: true,
          verifiedBackup: true,
          successfulWorkflow: true,
          lineageMatchingCurrentOutputs: true,
          currentCatalogInclusion: true,
        },
      },
    })

    opened.data.db.update(assetTable).set({ class: "font" }).where(eq(assetTable.id, "asset-eligibility")).run()
    expect(
      repository.sourceRevisionDeletionEligibilityRead("project-eligibility", "development", sourceRevisionId),
    ).toMatchObject({ success: true, data: { eligible: false, checks: { sourceIdentity: false } } })
    opened.data.db.update(assetTable).set({ class: "image" }).where(eq(assetTable.id, "asset-eligibility")).run()

    const receipt = opened.data.db.select().from(backupReceiptTable).get()
    expect(receipt).toBeDefined()
    if (receipt === undefined) return
    opened.data.db
      .update(backupReceiptTable)
      .set({ sha256: "b".repeat(64) })
      .where(eq(backupReceiptTable.id, receipt.id))
      .run()
    expect(
      repository.sourceRevisionDeletionEligibilityRead("project-eligibility", "development", sourceRevisionId),
    ).toMatchObject({ success: true, data: { eligible: false, checks: { verifiedBackup: false } } })
    opened.data.db
      .update(backupReceiptTable)
      .set({ sha256: receipt.sha256 })
      .where(eq(backupReceiptTable.id, receipt.id))
      .run()

    opened.data.db
      .update(workflowTable)
      .set({ status: "failed" })
      .where(eq(workflowTable.id, "workflow-eligibility"))
      .run()
    expect(
      repository.sourceRevisionDeletionEligibilityRead("project-eligibility", "development", sourceRevisionId),
    ).toMatchObject({ success: true, data: { eligible: false, checks: { successfulWorkflow: false } } })
    opened.data.db
      .update(workflowTable)
      .set({ status: "succeeded" })
      .where(eq(workflowTable.id, "workflow-eligibility"))
      .run()

    opened.data.db
      .update(workflowTable)
      .set({ sourceRevisionId: null })
      .where(eq(workflowTable.id, "workflow-eligibility"))
      .run()
    expect(
      repository.sourceRevisionDeletionEligibilityRead("project-eligibility", "development", sourceRevisionId),
    ).toMatchObject({ success: true, data: { eligible: false, checks: { successfulWorkflow: false } } })
    opened.data.db
      .update(workflowTable)
      .set({ sourceRevisionId })
      .where(eq(workflowTable.id, "workflow-eligibility"))
      .run()

    opened.data.db
      .update(outputVersionTable)
      .set({ current: false })
      .where(eq(outputVersionTable.id, "version-eligibility"))
      .run()
    expect(
      repository.sourceRevisionDeletionEligibilityRead("project-eligibility", "development", sourceRevisionId),
    ).toMatchObject({
      success: true,
      data: { eligible: false, checks: { lineageMatchingCurrentOutputs: false, currentCatalogInclusion: false } },
    })
    opened.data.db
      .update(outputVersionTable)
      .set({ current: true })
      .where(eq(outputVersionTable.id, "version-eligibility"))
      .run()

    opened.data.db.update(outputVersionTable).set({ sourceRevisionId: null }).run()
    expect(
      repository.sourceRevisionDeletionEligibilityRead("project-eligibility", "development", sourceRevisionId),
    ).toMatchObject({
      success: true,
      data: { eligible: false, checks: { lineageMatchingCurrentOutputs: false, currentCatalogInclusion: false } },
    })
    opened.data.db.update(outputVersionTable).set({ sourceRevisionId }).run()

    const catalogOutput = opened.data.db.select().from(catalogOutputTable).get()
    expect(catalogOutput).toBeDefined()
    if (catalogOutput === undefined) return
    opened.data.db.delete(catalogOutputTable).run()
    expect(
      repository.sourceRevisionDeletionEligibilityRead("project-eligibility", "development", sourceRevisionId),
    ).toMatchObject({ success: true, data: { eligible: false, checks: { currentCatalogInclusion: false } } })
    expect(databaseRecordInsert(opened.data.db, catalogOutputTable, catalogOutput).success).toBe(true)

    expect(
      repository.sourceRevisionDeletionEligibilityRead("project-eligibility", "production", sourceRevisionId),
    ).toMatchObject({
      success: true,
      data: { eligible: false, checks: { successfulWorkflow: false, currentCatalogInclusion: false } },
    })
    expect(
      repository.sourceRevisionDeletionEligibilityRead("other-project", "development", sourceRevisionId),
    ).toMatchObject({ success: true, data: { eligible: false, checks: { sourceIdentity: false } } })

    expect(
      repository.sourceRevisionDeletionEligibilityRead("project-eligibility", "staging", sourceRevisionId),
    ).toMatchObject({ success: false })
  } finally {
    databaseClose(opened.data)
  }
})

test("the lineage migration keeps legacy output versions nullable", () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return

  try {
    expect(databaseMigrate(opened.data).success).toBe(true)
    const columns = opened.data.client.query("PRAGMA table_info(output_versions)").all() as Array<{
      name: string
      notnull: number
    }>
    expect(columns.find((column) => column.name === "source_revision_id")?.notnull).toBe(0)
    const outputIndexes = opened.data.client.query("PRAGMA index_list(output_versions)").all() as Array<{
      name: string
    }>
    expect(outputIndexes.some((index) => index.name === "output_versions_source_revision_index")).toBe(true)
    const workflowColumns = opened.data.client.query("PRAGMA table_info(workflows)").all() as Array<{
      name: string
      notnull: number
    }>
    expect(workflowColumns.find((column) => column.name === "source_revision_id")?.notnull).toBe(0)
  } finally {
    databaseClose(opened.data)
  }
})
