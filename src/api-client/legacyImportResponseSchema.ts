import * as v from "valibot"

import { legacyImportStatusSchema } from "../import/legacyImportStatusSchema.js"

export const legacyImportResponseSchema = v.strictObject({
  import: legacyImportStatusSchema,
})

export type LegacyImportResponse = v.InferOutput<typeof legacyImportResponseSchema>
