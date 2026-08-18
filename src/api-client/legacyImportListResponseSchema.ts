import * as v from "valibot"

import { legacyImportStatusSchema } from "../import/legacyImportStatusSchema.js"
import { pageInfoSchema } from "./pageInfoSchema.js"

export const legacyImportListResponseSchema = v.strictObject({
  imports: v.array(legacyImportStatusSchema),
  page: pageInfoSchema,
})

export type LegacyImportListResponse = v.InferOutput<typeof legacyImportListResponseSchema>
