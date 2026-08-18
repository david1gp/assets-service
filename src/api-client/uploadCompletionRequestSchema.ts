import * as v from "valibot"

import { sha256Schema } from "../schemas/sha256Schema.js"

export const uploadCompletionRequestSchema = v.strictObject({
  sha256: sha256Schema,
})

export type UploadCompletionRequest = v.InferOutput<typeof uploadCompletionRequestSchema>
