import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"

export const uploadCompletionResponseSchema = v.strictObject({
  uploadId: idSchema,
  assetId: idSchema,
  sourceRevisionId: idSchema,
  workflowId: idSchema,
  status: v.literal("accepted"),
})

export type UploadCompletionResponse = v.InferOutput<typeof uploadCompletionResponseSchema>
