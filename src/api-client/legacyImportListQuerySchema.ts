import * as v from "valibot"

import { legacyImportStatusSchema } from "../import/legacyImportStatusSchema.js"
import { pageQuerySchema } from "./pageQuerySchema.js"

export const legacyImportListQuerySchema = v.strictObject({
  ...pageQuerySchema.entries,
  status: v.optional(legacyImportStatusSchema.entries.status),
})

export type LegacyImportListQuery = v.InferOutput<typeof legacyImportListQuerySchema>
