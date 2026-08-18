import * as v from "valibot"

import { structuredErrorSchema } from "../api/structuredErrorSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { jobKindSchema } from "./jobKindSchema.js"
import { jobPayloadSchema } from "./jobPayloadSchema.js"
import { jobStatusSchema } from "./jobStatusSchema.js"

export const jobSchema = v.strictObject({
  id: idSchema,
  workflowId: idSchema,
  kind: jobKindSchema,
  status: jobStatusSchema,
  availableAt: isoDateSchema,
  priority: v.pipe(v.number(), v.integer()),
  attempts: v.pipe(v.number(), v.integer(), v.minValue(0)),
  retryLimit: v.pipe(v.number(), v.integer(), v.minValue(0)),
  leaseOwner: v.nullable(v.string()),
  leaseExpiresAt: v.nullable(isoDateSchema),
  heartbeatAt: v.nullable(isoDateSchema),
  idempotencyKey: v.pipe(v.string(), v.minLength(1)),
  payloadSchemaVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  payload: jobPayloadSchema,
  error: v.nullable(structuredErrorSchema),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type Job = v.InferOutput<typeof jobSchema>
