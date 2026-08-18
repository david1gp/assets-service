import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { assetMetadataTable } from "../infrastructure/db/schema/assetMetadataTable.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { auditEventTable } from "../infrastructure/db/schema/auditEventTable.js"
import { backupReceiptTable } from "../infrastructure/db/schema/backupReceiptTable.js"
import { catalogGenerationTable } from "../infrastructure/db/schema/catalogGenerationTable.js"
import { catalogOutputTable } from "../infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../infrastructure/db/schema/catalogTable.js"
import { deletionStateTable } from "../infrastructure/db/schema/deletionStateTable.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { legacyImportTable } from "../infrastructure/db/schema/legacyImportTable.js"
import { organizationTable } from "../infrastructure/db/schema/organizationTable.js"
import { outputDefinitionTable } from "../infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../infrastructure/db/schema/outputVersionTable.js"
import { projectBindingTable } from "../infrastructure/db/schema/projectBindingTable.js"
import { projectTable } from "../infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../infrastructure/db/schema/sourceRevisionTable.js"
import { uploadTable } from "../infrastructure/db/schema/uploadTable.js"
import { workflowTable } from "../infrastructure/db/schema/workflowTable.js"
import type { Result } from "../schemas/resultSchema.js"

export type FixtureSeed = {
  organizationId: string
  projectId: string
  serviceProjectId: string
  zitadelProjectId: string
  subjectId: string
  assetIds: readonly string[]
  failedWorkflowId: string
  deadJobId: string
  retryableJobId: string
  retryableWorkflowId: string
  partialDeletionAssetId: string
}

const at = (minutes: number) => new Date(Date.UTC(2026, 7, 17, 9, minutes, 0)).toISOString()
const hash = (seed: string) => seed.repeat(64).slice(0, 64)

/**
 * Writes a small but complete project into an empty database: one image, one
 * video, and one font asset with outputs, source revisions, metadata, jobs,
 * backup receipts, a catalog generation, a legacy import, and audit events.
 */
export const fixtureDatabaseSeed = (db: AssetDatabase): Result<FixtureSeed> => {
  const seed: FixtureSeed = {
    organizationId: "org-fixture",
    projectId: "project-fixture",
    serviceProjectId: "contentoren",
    zitadelProjectId: "zitadel-fixture",
    subjectId: "fixture-admin",
    assetIds: ["asset-hero", "asset-intro", "asset-inter"],
    failedWorkflowId: "workflow-publish-failed",
    deadJobId: "job-publish-failed",
    retryableJobId: "job-publish-retryable",
    retryableWorkflowId: "workflow-backup-failed",
    partialDeletionAssetId: "asset-inter",
  }

  const written = databaseTransactionRun(db, (transaction) => {
    transaction
      .insert(organizationTable)
      .values({
        id: seed.organizationId,
        name: "Fixture organization",
        slug: "fixture-organization",
        createdAt: at(0),
        updatedAt: at(0),
      })
      .run()
    transaction
      .insert(projectTable)
      .values({
        id: seed.projectId,
        organizationId: seed.organizationId,
        name: "Contentoren",
        slug: "contentoren",
        defaultEnvironment: "development",
        createdAt: at(0),
        updatedAt: at(0),
      })
      .run()
    transaction
      .insert(projectBindingTable)
      .values({
        id: "binding-fixture",
        projectId: seed.projectId,
        organizationId: seed.organizationId,
        zitadelProjectId: seed.zitadelProjectId,
        serviceProjectId: seed.serviceProjectId,
        createdAt: at(0),
        updatedAt: at(0),
      })
      .run()
    for (const environment of ["development", "production"] as const) {
      transaction
        .insert(environmentTable)
        .values({
          id: `environment-${environment}`,
          projectId: seed.projectId,
          name: environment,
          r2Bucket: `assets-${environment}`,
          r2Prefix: seed.serviceProjectId,
          publicBaseUrl: `https://assets-${environment}.fixture.invalid`,
          createdAt: at(0),
          updatedAt: at(0),
        })
        .run()
    }

    const assets = [
      {
        id: "asset-hero",
        class: "image" as const,
        folder1: "home",
        filename: "hero.png",
        basename: "hero",
        mediaType: "image/png",
        note: "Hero banner of the landing page",
      },
      {
        id: "asset-intro",
        class: "video" as const,
        folder1: "home",
        filename: "intro.mp4",
        basename: "intro",
        mediaType: "video/mp4",
        note: "Autoplaying intro loop above the fold",
      },
      {
        id: "asset-inter",
        class: "font" as const,
        folder1: "ui",
        filename: "Inter-Regular.ttf",
        basename: "Inter-Regular",
        mediaType: "font/ttf",
        note: "Body copy typeface",
      },
    ]

    for (const [index, asset] of assets.entries()) {
      transaction
        .insert(assetTable)
        .values({
          id: asset.id,
          projectId: seed.projectId,
          class: asset.class,
          folder1: asset.folder1,
          folder2: null,
          folder3: null,
          filename: asset.filename,
          basename: asset.basename,
          currentSourceRevisionId: `source-${asset.id}`,
          integrationNote: asset.note,
          createdAt: at(index),
          updatedAt: at(index + 10),
        })
        .run()
      transaction
        .insert(sourceRevisionTable)
        .values({
          id: `source-${asset.id}`,
          assetId: asset.id,
          revision: 1,
          class: asset.class,
          originalFilename: asset.filename,
          mediaType: asset.mediaType,
          byteSize: 12_000 + index * 5_000,
          sha256: hash(String(index + 1)),
          objectKey: `${seed.serviceProjectId}/private/sources/${asset.id}/1/${asset.filename}`,
          createdAt: at(index),
        })
        .run()
    }

    transaction
      .insert(assetMetadataTable)
      .values({
        id: "metadata-hero",
        assetId: "asset-hero",
        sourceRevisionId: "source-asset-hero",
        metadata: {
          kind: "image",
          width: 2400,
          height: 1350,
          format: "png",
          colorSpace: "srgb",
          alpha: true,
          orientationApplied: true,
          frameCount: 1,
          animated: false,
          alt: "A wide product shot on a dark background",
          aiProvenance: "generated",
          showAiLabel: true,
        },
        createdAt: at(1),
        updatedAt: at(11),
      })
      .run()

    const definitions = [
      { id: "output-hero-large", assetId: "asset-hero", key: "1600x900_webp", width: 1600, height: 900 },
      { id: "output-hero-small", assetId: "asset-hero", key: "800x450_webp", width: 800, height: 450 },
    ]
    for (const definition of definitions) {
      transaction
        .insert(outputDefinitionTable)
        .values({
          id: definition.id,
          assetId: definition.assetId,
          kind: "image",
          key: definition.key,
          width: definition.width,
          height: definition.height,
          format: "webp",
          quality: 82,
          showAiLabel: true,
          createdAt: at(2),
          updatedAt: at(2),
        })
        .run()
      transaction
        .insert(outputVersionTable)
        .values({
          id: `version-${definition.id}`,
          outputDefinitionId: definition.id,
          assetId: definition.assetId,
          version: 1,
          byteSize: definition.width * 40,
          sha256: hash(definition.key.slice(0, 1)),
          mediaType: "image/webp",
          extension: "webp",
          objectKey: `${seed.serviceProjectId}/images/home/${definition.key}/hero.webp`,
          toolchainVersion: "fixture-1",
          width: definition.width,
          height: definition.height,
          current: true,
          createdAt: at(3),
        })
        .run()
    }

    transaction
      .insert(outputDefinitionTable)
      .values({
        id: "output-intro",
        assetId: "asset-intro",
        kind: "video",
        key: "source",
        width: null,
        height: null,
        format: null,
        quality: null,
        showAiLabel: null,
        createdAt: at(2),
        updatedAt: at(2),
      })
      .run()
    transaction
      .insert(outputVersionTable)
      .values({
        id: "version-output-intro",
        outputDefinitionId: "output-intro",
        assetId: "asset-intro",
        version: 1,
        byteSize: 480_000,
        sha256: hash("4"),
        mediaType: "video/mp4",
        extension: "mp4",
        objectKey: `${seed.serviceProjectId}/videos/home/intro.mp4`,
        toolchainVersion: "fixture-1",
        width: 1920,
        height: 1080,
        current: true,
        createdAt: at(3),
      })
      .run()

    transaction
      .insert(outputDefinitionTable)
      .values({
        id: "output-inter",
        assetId: "asset-inter",
        kind: "font",
        key: "woff2",
        width: null,
        height: null,
        format: "woff2",
        quality: null,
        showAiLabel: null,
        createdAt: at(2),
        updatedAt: at(2),
      })
      .run()
    transaction
      .insert(outputVersionTable)
      .values({
        id: "version-output-inter",
        outputDefinitionId: "output-inter",
        assetId: "asset-inter",
        version: 1,
        byteSize: 96_000,
        sha256: hash("5"),
        mediaType: "font/woff2",
        extension: "woff2",
        objectKey: `${seed.serviceProjectId}/fonts/ui/Inter-Regular.woff2`,
        toolchainVersion: "fixture-1",
        width: null,
        height: null,
        current: true,
        createdAt: at(3),
      })
      .run()

    transaction
      .insert(uploadTable)
      .values({
        id: "upload-hero",
        projectId: seed.projectId,
        environmentId: "environment-development",
        assetId: "asset-hero",
        sourceRevisionId: "source-asset-hero",
        uploaderId: seed.subjectId,
        notificationEligible: true,
        originalFilename: "hero.png",
        folder1: "home",
        folder2: null,
        folder3: null,
        integrationNote: "Hero banner of the landing page",
        stagingObjectKey: `${seed.serviceProjectId}/private/staging/uploads/upload-hero`,
        byteSize: 12_000,
        mediaType: "image/png",
        sha256: hash("1"),
        status: "accepted",
        failureReason: null,
        verifiedAt: at(1),
        createdAt: at(0),
        updatedAt: at(4),
      })
      .run()

    const workflows = [
      { id: "workflow-hero", assetId: "asset-hero", status: "succeeded" as const },
      { id: "workflow-intro", assetId: "asset-intro", status: "running" as const },
      { id: "workflow-inter", assetId: "asset-inter", status: "failed" as const },
    ]
    for (const [index, workflow] of workflows.entries()) {
      transaction
        .insert(workflowTable)
        .values({
          id: workflow.id,
          projectId: seed.projectId,
          assetId: workflow.assetId,
          kind: "asset_processing",
          status: workflow.status,
          createdAt: at(index + 4),
          updatedAt: at(index + 6),
        })
        .run()
      transaction
        .insert(jobTable)
        .values({
          id: `job-${workflow.id}`,
          workflowId: workflow.id,
          kind: "plan_outputs",
          status: workflow.status === "succeeded" ? "succeeded" : workflow.status === "running" ? "running" : "dead",
          availableAt: at(index + 4),
          priority: 10,
          attempts: workflow.status === "failed" ? 3 : 1,
          retryLimit: 3,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          idempotencyKey: `${workflow.id}:plan_outputs`,
          payloadSchemaVersion: 1,
          payload: { assetId: workflow.assetId },
          error:
            workflow.status === "failed"
              ? { code: "internal_error", message: "The font could not be subset", retryable: false }
              : null,
          createdAt: at(index + 4),
          updatedAt: at(index + 6),
        })
        .run()
    }

    // Two independent failure sets. `workflow-publish-failed` is the target for
    // retrying a single job, `workflow-backup-failed` for retrying a whole
    // workflow. Keeping them apart matters because a job retry also re-queues
    // its parent workflow, so one seed cannot serve both checks.
    // `workflow-inter` is reachable too, but output-set edits on `asset-hero`
    // re-queue jobs around it.
    transaction
      .insert(workflowTable)
      .values({
        id: "workflow-publish-failed",
        projectId: seed.projectId,
        assetId: "asset-hero",
        kind: "asset_processing",
        status: "failed",
        createdAt: at(8),
        updatedAt: at(9),
      })
      .run()
    transaction
      .insert(jobTable)
      .values({
        id: "job-publish-failed",
        workflowId: "workflow-publish-failed",
        kind: "publish_asset",
        status: "dead",
        availableAt: at(8),
        priority: 10,
        attempts: 3,
        retryLimit: 3,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        idempotencyKey: "workflow-publish-failed:publish_asset",
        payloadSchemaVersion: 1,
        payload: { assetId: "asset-hero" },
        error: { code: "internal_error", message: "The public manifest write timed out", retryable: true },
        createdAt: at(8),
        updatedAt: at(9),
      })
      .run()
    transaction
      .insert(jobTable)
      .values({
        id: "job-publish-retryable",
        workflowId: "workflow-publish-failed",
        kind: "cleanup_local_files",
        status: "retryable",
        availableAt: at(9),
        priority: 20,
        attempts: 1,
        retryLimit: 3,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        idempotencyKey: "workflow-publish-failed:cleanup_local_files",
        payloadSchemaVersion: 1,
        payload: { assetId: "asset-hero" },
        error: { code: "internal_error", message: "The staging prefix was still locked", retryable: true },
        createdAt: at(9),
        updatedAt: at(9),
      })
      .run()

    // A second failed workflow, so retrying a whole workflow and retrying a
    // single job can both be exercised without one consuming the other.
    transaction
      .insert(workflowTable)
      .values({
        id: "workflow-backup-failed",
        projectId: seed.projectId,
        assetId: "asset-intro",
        kind: "asset_processing",
        status: "failed",
        createdAt: at(10),
        updatedAt: at(11),
      })
      .run()
    transaction
      .insert(jobTable)
      .values({
        id: "job-backup-failed",
        workflowId: "workflow-backup-failed",
        kind: "backup_original",
        status: "dead",
        availableAt: at(10),
        priority: 10,
        attempts: 3,
        retryLimit: 3,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        idempotencyKey: "workflow-backup-failed:backup_original",
        payloadSchemaVersion: 1,
        payload: { assetId: "asset-intro" },
        error: { code: "internal_error", message: "The rclone remote refused the transfer", retryable: true },
        createdAt: at(10),
        updatedAt: at(11),
      })
      .run()

    // A deletion caught mid-flight, so the asset detail page shows non-zero step
    // counts next to a non-zero remote-object count instead of only 0 or 100.
    transaction
      .insert(workflowTable)
      .values({
        id: `workflow-deletion-${seed.partialDeletionAssetId}`,
        projectId: seed.projectId,
        assetId: seed.partialDeletionAssetId,
        kind: "deletion",
        status: "running",
        createdAt: at(12),
        updatedAt: at(13),
      })
      .run()
    transaction
      .insert(deletionStateTable)
      .values({
        id: `deletion-${seed.partialDeletionAssetId}`,
        assetId: seed.partialDeletionAssetId,
        status: "in_progress",
        completedSteps: ["plan:remote-objects", "remote:public:inter-400.woff2"],
        pendingRemoteObjects: ["public:inter-700.woff2", "backup:inter.ttf"],
        error: null,
        requestedAt: at(12),
        updatedAt: at(13),
        completedAt: null,
      })
      .run()

    transaction
      .insert(backupReceiptTable)
      .values({
        id: "receipt-hero",
        projectId: seed.projectId,
        sourceRevisionId: "source-asset-hero",
        jobId: "job-workflow-hero",
        remotePath: "gdrive_beta:backups/contentoren/asset-hero/1/hero.png",
        byteSize: 12_000,
        sha256: hash("1"),
        checkResult: "verified",
        completedAt: at(5),
      })
      .run()

    transaction
      .insert(catalogGenerationTable)
      .values({
        id: "generation-1",
        projectId: seed.projectId,
        environment: "development",
        digest: hash("6"),
        manifestObjectKey: `${seed.serviceProjectId}/manifests/generation-1.json`,
        rendererVersion: "fixture-1",
        createdAt: at(7),
      })
      .run()
    transaction
      .insert(catalogOutputTable)
      .values({
        generationId: "generation-1",
        assetId: "asset-hero",
        outputVersionId: "version-output-hero-large",
        class: "image",
        key: "1600x900_webp",
        property: "home/hero",
        path: "images/home/1600x900_webp/hero.webp",
        metadata: {
          kind: "image",
          width: 1600,
          height: 900,
          format: "webp",
          colorSpace: "srgb",
          alpha: true,
          orientationApplied: true,
          frameCount: 1,
          animated: false,
          alt: "A wide product shot on a dark background",
          aiProvenance: "generated",
          showAiLabel: true,
        },
      })
      .run()
    transaction
      .insert(catalogTable)
      .values({
        id: "catalog-development",
        projectId: seed.projectId,
        environment: "development",
        generationId: "generation-1",
        schema: "assets.catalog.v1",
        digest: hash("6"),
        rendererVersion: "fixture-1",
        generatedAt: at(7),
        updatedAt: at(7),
      })
      .run()

    transaction
      .insert(legacyImportTable)
      .values({
        id: "import-1",
        projectId: seed.projectId,
        actorId: seed.subjectId,
        root: "/srv/legacy/contentoren",
        environment: "development",
        atomicity: "all_or_nothing",
        status: "succeeded",
        importedCount: 3,
        conflicts: [],
        createdAt: at(8),
        updatedAt: at(9),
        completedAt: at(9),
      })
      .run()

    for (const [index, asset] of assets.entries()) {
      transaction
        .insert(auditEventTable)
        .values({
          id: `audit-${index + 1}`,
          organizationId: seed.organizationId,
          projectId: seed.projectId,
          actorId: seed.subjectId,
          action: "asset.created",
          resourceType: "asset",
          resourceId: asset.id,
          details: { filename: asset.filename },
          createdAt: at(index + 1),
        })
        .run()
    }

    return { success: true, data: null } as const
  })
  if (!written.success) return written
  return { success: true, data: seed }
}
