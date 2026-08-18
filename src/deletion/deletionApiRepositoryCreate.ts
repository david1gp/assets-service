import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { auditEventTable } from "../infrastructure/db/schema/auditEventTable.js"
import { deletionStateTable } from "../infrastructure/db/schema/deletionStateTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { organizationTable } from "../infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../infrastructure/db/schema/projectTable.js"
import { workflowTable } from "../infrastructure/db/schema/workflowTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import { workflowJobCreate } from "../workflow/workflowJobCreate.js"
import type { DeletionApiRepository } from "./deletionApiRepository.js"
import { deletionStateSchema } from "./deletionStateSchema.js"
import { sourceRevisionDeletionEligibilityRepositoryCreate } from "./sourceRevisionDeletionEligibilityRepositoryCreate.js"

export const deletionApiRepositoryCreate = (db: AssetDatabase): DeletionApiRepository => {
  const sourceRevisionDeletionEligibilityRepository = sourceRevisionDeletionEligibilityRepositoryCreate(db)
  const deletionRequestEnqueue = (projectId: string, assetId: string, actorId = "system") =>
    databaseTransactionRun(db, (transaction) => {
      const op = "deletionApiRepositoryRequestEnqueue"
      const deletionId = `deletion-${assetId}`
      const workflowId = `workflow-deletion-${assetId}`
      const existingState = transaction
        .select()
        .from(deletionStateTable)
        .where(eq(deletionStateTable.assetId, assetId))
        .get()
      const asset = transaction.select().from(assetTable).where(eq(assetTable.id, assetId)).get()
      if (existingState === undefined && (asset === undefined || asset.projectId !== projectId))
        return resultErrorCreate(op, "The asset was not found")

      const workflow = transaction.select().from(workflowTable).where(eq(workflowTable.id, workflowId)).get()
      if (workflow !== undefined) {
        if (workflow.projectId !== projectId || workflow.kind !== "deletion")
          return resultErrorCreate(op, "The deletion workflow identity was invalid")
      } else {
        if (asset === undefined) return resultErrorCreate(op, "The deletion workflow was not found")
        const now = new Date().toISOString()
        const insertedWorkflow = databaseRecordInsert(transaction, workflowTable, {
          id: workflowId,
          projectId,
          assetId,
          kind: "deletion",
          status: "queued",
          createdAt: now,
          updatedAt: now,
        })
        if (!insertedWorkflow.success) return insertedWorkflow
      }

      const now = new Date().toISOString()
      if (existingState === undefined) {
        const insertedState = databaseRecordInsert(transaction, deletionStateTable, {
          id: deletionId,
          assetId,
          status: "requested",
          completedSteps: [],
          pendingRemoteObjects: [],
          error: null,
          requestedAt: now,
          updatedAt: now,
          completedAt: null,
        })
        if (!insertedState.success) return insertedState
      } else if (existingState.id !== deletionId) {
        return resultErrorCreate(op, "The deletion identity was invalid")
      }

      const jobId = `${workflowId}-delete`
      const existingJob = transaction.select().from(jobTable).where(eq(jobTable.id, jobId)).get()
      if (existingJob !== undefined) {
        if (existingJob.workflowId !== workflowId || existingJob.kind !== "delete_asset")
          return resultErrorCreate(op, "The deletion job identity was invalid")
      } else {
        const job = workflowJobCreate({
          id: jobId,
          workflowId,
          kind: "delete_asset",
          payload: { assetId, deletionId },
          now,
          retryLimit: 3,
        })
        const insertedJob = databaseRecordInsert(transaction, jobTable, job)
        if (!insertedJob.success) return insertedJob
      }

      if (existingState === undefined) {
        const project = transaction.select().from(projectTable).where(eq(projectTable.id, projectId)).get()
        if (project === undefined) return resultErrorCreate(op, "The project was not found")
        const organization = transaction
          .select()
          .from(organizationTable)
          .where(eq(organizationTable.id, project.organizationId))
          .get()
        if (organization === undefined) return resultErrorCreate(op, "The organization was not found")
        const auditId = `audit-deletion-request-${assetId}`
        const existingAudit = transaction.select().from(auditEventTable).where(eq(auditEventTable.id, auditId)).get()
        if (existingAudit === undefined) {
          const audit = databaseRecordInsert(transaction, auditEventTable, {
            id: auditId,
            organizationId: organization.id,
            projectId,
            actorId,
            action: "asset.deletion_requested",
            resourceType: "asset",
            resourceId: assetId,
            details: { deletionId, workflowId },
            createdAt: now,
          })
          if (!audit.success) return audit
        }
      }

      const state = transaction
        .select({ status: deletionStateTable.status })
        .from(deletionStateTable)
        .where(eq(deletionStateTable.id, deletionId))
        .get()
      if (state === undefined) return resultErrorCreate(op, "The deletion state disappeared")
      return { success: true, data: { deletionId, workflowId, status: state.status } } as const
    })

  const deletionStateRead: NonNullable<DeletionApiRepository["deletionStateRead"]> = (projectId, assetId) => {
    const record = db
      .select({ state: deletionStateTable, workflow: workflowTable })
      .from(deletionStateTable)
      .innerJoin(workflowTable, eq(workflowTable.id, `workflow-deletion-${assetId}`))
      .where(and(eq(deletionStateTable.assetId, assetId), eq(workflowTable.projectId, projectId)))
      .get()
    if (record === undefined) return { success: true, data: null }
    const { error, completedAt, ...state } = record.state
    const parsed = v.safeParse(deletionStateSchema, {
      ...state,
      ...(error === null ? {} : { error }),
      ...(completedAt === null ? {} : { completedAt }),
    })
    if (!parsed.success) return resultErrorCreate("deletionApiRepositoryStateRead", v.summarize(parsed.issues))
    return { success: true, data: parsed.output }
  }

  return {
    deletionRequestEnqueue,
    deletionStateRead,
    sourceRevisionDeletionEligibilityRead:
      sourceRevisionDeletionEligibilityRepository.sourceRevisionDeletionEligibilityRead,
  }
}
