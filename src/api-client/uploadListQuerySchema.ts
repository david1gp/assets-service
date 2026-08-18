import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { uploadStatusSchema } from "../upload/uploadStatusSchema.js"
import { pageQuerySchema } from "./pageQuerySchema.js"

export const uploadListQuerySchema = v.strictObject({
  ...pageQuerySchema.entries,
  status: v.optional(uploadStatusSchema),
  assetId: v.optional(idSchema),
})

export type UploadListQuery = v.InferOutput<typeof uploadListQuerySchema>
