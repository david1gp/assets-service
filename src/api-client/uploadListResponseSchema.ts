import * as v from "valibot"

import { uploadSchema } from "../upload/uploadSchema.js"
import { pageInfoSchema } from "./pageInfoSchema.js"

export const uploadListResponseSchema = v.strictObject({
  uploads: v.array(uploadSchema),
  page: pageInfoSchema,
})

export type UploadListResponse = v.InferOutput<typeof uploadListResponseSchema>
