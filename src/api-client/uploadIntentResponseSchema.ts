import * as v from "valibot"

import { storageUploadIntentSchema } from "../storage/storageUploadIntentSchema.js"
import { uploadStatusSchema } from "../upload/uploadStatusSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const uploadIntentResponseSchema = v.strictObject({
  uploadId: idSchema,
  status: uploadStatusSchema,
  intent: storageUploadIntentSchema,
})

export type UploadIntentResponse = v.InferOutput<typeof uploadIntentResponseSchema>
