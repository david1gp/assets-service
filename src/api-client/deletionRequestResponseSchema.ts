import * as v from "valibot"

import { deletionStateSchema } from "../deletion/deletionStateSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const deletionRequestResponseSchema = v.strictObject({
  deletionId: idSchema,
  workflowId: idSchema,
  status: deletionStateSchema.entries.status,
})

export type DeletionRequestResponse = v.InferOutput<typeof deletionRequestResponseSchema>
