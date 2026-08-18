import { and, asc, eq } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { outputDefinitionTable } from "../infrastructure/db/schema/outputDefinitionTable.js"
import { projectTable } from "../infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../infrastructure/db/schema/sourceRevisionTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { workflowJobCreate } from "./workflowJobCreate.js"
import { workflowJobIdCreate } from "./workflowJobIdCreate.js"
import { workflowRepositoryEnqueue } from "./workflowRepositoryEnqueue.js"
import type { Workflow } from "./workflowSchema.js"

export const assetProcessingWorkflowEnqueue = (
  db: AssetDatabase,
  input: {
    projectId: string
    assetId: string
    workflowId: string
    now?: string
    retryLimit?: number
    forceNewVersion?: boolean
  },
): Result<{ workflowId: string }> => {
  const op = "assetProcessingWorkflowEnqueue"
  const now = input.now ?? new Date().toISOString()
  const retryLimit = input.retryLimit ?? 3
  if (!Number.isInteger(retryLimit) || retryLimit < 0) return resultErrorCreate(op, "Retry limit is invalid")

  const project = db.select().from(projectTable).where(eq(projectTable.id, input.projectId)).get()
  if (project === undefined) return resultErrorCreate(op, "The project was not found")
  const asset = db
    .select()
    .from(assetTable)
    .where(and(eq(assetTable.projectId, input.projectId), eq(assetTable.id, input.assetId)))
    .get()
  if (asset === undefined) return resultErrorCreate(op, "The asset was not found")
  const source = db
    .select()
    .from(sourceRevisionTable)
    .where(eq(sourceRevisionTable.id, asset.currentSourceRevisionId))
    .get()
  if (source === undefined || source.assetId !== asset.id)
    return resultErrorCreate(op, "The asset source revision was not found")
  const environment = db
    .select()
    .from(environmentTable)
    .where(eq(environmentTable.projectId, input.projectId))
    .all()
    .find((candidate) => candidate.name === project.defaultEnvironment)
  if (environment === undefined) return resultErrorCreate(op, "The project environment was not found")

  const workflow: Workflow = {
    id: input.workflowId,
    projectId: input.projectId,
    assetId: input.assetId,
    sourceRevisionId: source.id,
    kind: "asset_processing",
    status: "queued",
    createdAt: now,
    updatedAt: now,
  }
  const context = {
    assetId: input.assetId,
    sourceRevisionId: source.id,
    environmentId: environment.id,
    ...(input.forceNewVersion === true ? { values: { forceNewVersion: true } } : {}),
  }
  const definitions = db
    .select()
    .from(outputDefinitionTable)
    .where(eq(outputDefinitionTable.assetId, input.assetId))
    .orderBy(asc(outputDefinitionTable.key), asc(outputDefinitionTable.id))
    .all()
  const verifyJob = workflowJobCreate({
    id: `${input.workflowId}-verify`,
    workflowId: input.workflowId,
    kind: "verify_original",
    payload: context,
    now,
    retryLimit,
  })
  const backupJob = workflowJobCreate({
    id: `${input.workflowId}-backup`,
    workflowId: input.workflowId,
    kind: "backup_original",
    payload: context,
    now,
    retryLimit,
  })
  const planJob = workflowJobCreate({
    id: `${input.workflowId}-plan`,
    workflowId: input.workflowId,
    kind: "plan_outputs",
    payload: context,
    now,
    retryLimit,
  })
  const outputJobs = definitions.map((definition) =>
    workflowJobCreate({
      id: workflowJobIdCreate(input.workflowId, `output-${definition.id}`),
      workflowId: input.workflowId,
      kind:
        definition.kind === "image"
          ? "process_image_output"
          : definition.kind === "video"
            ? "copy_video_output"
            : definition.kind === "font"
              ? "process_font_output"
              : "process_document_output",
      payload: { ...context, outputDefinitionId: definition.id },
      now,
      retryLimit,
    }),
  )
  const publishJob = workflowJobCreate({
    id: `${input.workflowId}-publish`,
    workflowId: input.workflowId,
    kind: "publish_asset",
    payload: context,
    now,
    retryLimit,
  })
  const jobs = [verifyJob, backupJob, planJob, ...outputJobs, publishJob]
  const dependencies = [
    dependencyCreate(`${input.workflowId}-dependency-backup`, backupJob.id, verifyJob.id, now),
    dependencyCreate(`${input.workflowId}-dependency-plan`, planJob.id, backupJob.id, now),
    dependencyCreate(`${input.workflowId}-dependency-publish-plan`, publishJob.id, planJob.id, now),
    ...outputJobs.map((job) =>
      dependencyCreate(workflowJobIdCreate(job.id, "dependency-plan"), job.id, planJob.id, now),
    ),
    ...outputJobs.map((job) =>
      dependencyCreate(workflowJobIdCreate(publishJob.id, `dependency-${job.id}`), publishJob.id, job.id, now),
    ),
  ]
  const enqueued = workflowRepositoryEnqueue(db, { workflow, jobs, dependencies })
  if (!enqueued.success) return enqueued
  return { success: true, data: { workflowId: input.workflowId } }
}

function dependencyCreate(id: string, jobId: string, dependsOnJobId: string, createdAt: string) {
  return { id, jobId, dependsOnJobId, createdAt }
}
