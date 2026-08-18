import { and, eq } from "drizzle-orm"
import * as v from "valibot"

import {
  sourceRevisionDeletionEligibilityResponseSchema,
  type SourceRevisionDeletionEligibilityResponse,
} from "../api-client/sourceRevisionDeletionEligibilityResponseSchema.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { backupReceiptTable } from "../infrastructure/db/schema/backupReceiptTable.js"
import { catalogGenerationTable } from "../infrastructure/db/schema/catalogGenerationTable.js"
import { catalogOutputTable } from "../infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../infrastructure/db/schema/catalogTable.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { outputDefinitionTable } from "../infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../infrastructure/db/schema/outputVersionTable.js"
import { projectTable } from "../infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../infrastructure/db/schema/sourceRevisionTable.js"
import { workflowTable } from "../infrastructure/db/schema/workflowTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { jobPayloadSchema } from "../workflow/jobPayloadSchema.js"
import type { SourceRevisionDeletionEligibilityRepository } from "./sourceRevisionDeletionEligibilityRepository.js"

const checksFalse = () => ({
  sourceIdentity: false,
  verifiedBackup: false,
  successfulWorkflow: false,
  lineageMatchingCurrentOutputs: false,
  currentCatalogInclusion: false,
})

const eligibilityCreate = (
  sourceRevisionId: string,
  checks: ReturnType<typeof checksFalse>,
): SourceRevisionDeletionEligibilityResponse => ({
  sourceRevisionId,
  eligible: Object.values(checks).every(Boolean),
  checks,
})

const jobPayloadMatches = (
  job: typeof jobTable.$inferSelect,
  assetId: string,
  sourceRevisionId: string,
  environmentId: string,
): boolean => {
  const parsed = v.safeParse(jobPayloadSchema, job.payload)
  return (
    parsed.success &&
    parsed.output.assetId === assetId &&
    parsed.output.sourceRevisionId === sourceRevisionId &&
    parsed.output.environmentId === environmentId
  )
}

export const sourceRevisionDeletionEligibilityRepositoryCreate = (
  db: AssetDatabase,
): SourceRevisionDeletionEligibilityRepository => {
  const sourceRevisionDeletionEligibilityRead: SourceRevisionDeletionEligibilityRepository["sourceRevisionDeletionEligibilityRead"] =
    (projectId, environment, sourceRevisionId) =>
      databaseTransactionRun(db, (transaction) => {
        const parsedEnvironment = v.safeParse(environmentNameSchema, environment)
        if (!parsedEnvironment.success)
          return resultErrorCreate("sourceRevisionDeletionEligibilityRead", "The target environment was invalid")

        const targetEnvironment = transaction
          .select()
          .from(environmentTable)
          .where(and(eq(environmentTable.projectId, projectId), eq(environmentTable.name, parsedEnvironment.output)))
          .get()
        const source = transaction
          .select({ source: sourceRevisionTable, asset: assetTable, project: projectTable })
          .from(sourceRevisionTable)
          .innerJoin(assetTable, eq(assetTable.id, sourceRevisionTable.assetId))
          .innerJoin(projectTable, eq(projectTable.id, assetTable.projectId))
          .where(and(eq(sourceRevisionTable.id, sourceRevisionId), eq(projectTable.id, projectId)))
          .get()
        if (source === undefined) {
          const parsed = v.safeParse(
            sourceRevisionDeletionEligibilityResponseSchema,
            eligibilityCreate(sourceRevisionId, checksFalse()),
          )
          if (!parsed.success)
            return resultErrorCreate("sourceRevisionDeletionEligibilityRead", "The eligibility result was invalid")
          return { success: true, data: parsed.output }
        }

        const checks = checksFalse()
        checks.sourceIdentity =
          source.asset.currentSourceRevisionId === source.source.id && source.asset.class === source.source.class

        const verifiedBackup = transaction
          .select()
          .from(backupReceiptTable)
          .where(
            and(
              eq(backupReceiptTable.projectId, projectId),
              eq(backupReceiptTable.sourceRevisionId, source.source.id),
              eq(backupReceiptTable.checkResult, "verified"),
            ),
          )
          .all()
          .find(
            (receipt) =>
              receipt.byteSize === source.source.byteSize &&
              receipt.sha256 === source.source.sha256 &&
              receipt.remotePath.startsWith("gdrive_beta:"),
          )
        checks.verifiedBackup = verifiedBackup !== undefined

        const workflows = transaction
          .select()
          .from(workflowTable)
          .where(
            and(
              eq(workflowTable.projectId, projectId),
              eq(workflowTable.assetId, source.asset.id),
              eq(workflowTable.kind, "asset_processing"),
              eq(workflowTable.status, "succeeded"),
            ),
          )
          .all()
        checks.successfulWorkflow =
          targetEnvironment !== undefined &&
          workflows.some((workflow) => {
            if (workflow.sourceRevisionId !== source.source.id) return false
            const jobs = transaction.select().from(jobTable).where(eq(jobTable.workflowId, workflow.id)).all()
            const backupJob = jobs.find(
              (job) =>
                job.kind === "backup_original" &&
                job.status === "succeeded" &&
                jobPayloadMatches(job, source.asset.id, source.source.id, targetEnvironment.id),
            )
            const publishJob = jobs.find(
              (job) =>
                job.kind === "publish_asset" &&
                job.status === "succeeded" &&
                jobPayloadMatches(job, source.asset.id, source.source.id, targetEnvironment.id),
            )
            return backupJob !== undefined && publishJob !== undefined && verifiedBackup?.jobId === backupJob.id
          })

        const definitions = transaction
          .select()
          .from(outputDefinitionTable)
          .where(eq(outputDefinitionTable.assetId, source.asset.id))
          .all()
        const currentOutputs = transaction
          .select()
          .from(outputVersionTable)
          .where(and(eq(outputVersionTable.assetId, source.asset.id), eq(outputVersionTable.current, true)))
          .all()
        const definitionIds = new Set(definitions.map((definition) => definition.id))
        checks.lineageMatchingCurrentOutputs =
          definitions.length > 0 &&
          currentOutputs.length === definitions.length &&
          currentOutputs.every(
            (output) => definitionIds.has(output.outputDefinitionId) && output.sourceRevisionId === source.source.id,
          )

        const currentCatalog = transaction
          .select({ catalog: catalogTable })
          .from(catalogTable)
          .innerJoin(catalogGenerationTable, eq(catalogGenerationTable.id, catalogTable.generationId))
          .where(
            and(
              eq(catalogTable.projectId, projectId),
              eq(catalogTable.environment, parsedEnvironment.output),
              eq(catalogGenerationTable.projectId, projectId),
              eq(catalogGenerationTable.environment, parsedEnvironment.output),
            ),
          )
          .get()
        if (currentCatalog !== undefined) {
          const catalogOutputs = transaction
            .select()
            .from(catalogOutputTable)
            .where(
              and(
                eq(catalogOutputTable.generationId, currentCatalog.catalog.generationId),
                eq(catalogOutputTable.assetId, source.asset.id),
              ),
            )
            .all()
          const currentOutputIds = new Set(currentOutputs.map((output) => output.id))
          checks.currentCatalogInclusion =
            checks.lineageMatchingCurrentOutputs &&
            catalogOutputs.length === currentOutputs.length &&
            catalogOutputs.every((output) => currentOutputIds.has(output.outputVersionId))
        }

        const parsed = v.safeParse(
          sourceRevisionDeletionEligibilityResponseSchema,
          eligibilityCreate(sourceRevisionId, checks),
        )
        if (!parsed.success)
          return resultErrorCreate(
            "sourceRevisionDeletionEligibilityRead",
            "The eligibility result was invalid",
            parsed.issues,
          )
        return { success: true, data: parsed.output }
      })

  return { sourceRevisionDeletionEligibilityRead }
}
