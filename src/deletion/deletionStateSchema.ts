import * as v from "valibot"
import { idSchema } from "../schemas/idSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { jsonObjectSchema } from "../schemas/jsonObjectSchema.js"

export const deletionStateSchema = v.strictObject({
  id: idSchema,
  assetId: idSchema,
  status: v.picklist(["requested", "in_progress", "succeeded", "retryable", "failed"]),
  completedSteps: v.array(v.pipe(v.string(), v.minLength(1))),
  pendingRemoteObjects: v.array(v.pipe(v.string(), v.minLength(1))),
  error: v.optional(jsonObjectSchema),
  requestedAt: isoDateSchema,
  updatedAt: isoDateSchema,
  completedAt: v.optional(isoDateSchema),
})

export type DeletionState = v.InferOutput<typeof deletionStateSchema>
