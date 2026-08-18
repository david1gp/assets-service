import type { JobPayload } from "./jobPayloadSchema.js"
import type { Job } from "./jobSchema.js"

type WorkflowJobCreateInput = {
  id: string
  workflowId: string
  kind: Job["kind"]
  payload: JobPayload
  now: string
  retryLimit: number
}

export const workflowJobCreate = (input: WorkflowJobCreateInput): JobTableInsert => ({
  id: input.id,
  workflowId: input.workflowId,
  kind: input.kind,
  status: "queued",
  availableAt: input.now,
  priority: 0,
  attempts: 0,
  retryLimit: input.retryLimit,
  leaseOwner: null,
  leaseExpiresAt: null,
  heartbeatAt: null,
  idempotencyKey: `asset-processing:${input.workflowId}:${input.kind}:${input.payload.outputDefinitionId ?? "asset"}`,
  payloadSchemaVersion: 1,
  payload: input.payload,
  error: null,
  createdAt: input.now,
  updatedAt: input.now,
})

type JobTableInsert = {
  id: string
  workflowId: string
  kind: Job["kind"]
  status: "queued"
  availableAt: string
  priority: number
  attempts: number
  retryLimit: number
  leaseOwner: null
  leaseExpiresAt: null
  heartbeatAt: null
  idempotencyKey: string
  payloadSchemaVersion: number
  payload: JobPayload
  error: null
  createdAt: string
  updatedAt: string
}
