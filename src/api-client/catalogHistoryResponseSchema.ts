import * as v from "valibot"

import { catalogResponseSchema } from "./catalogResponseSchema.js"
import { pageInfoSchema } from "./pageInfoSchema.js"

export const catalogHistoryResponseSchema = v.strictObject({
  catalogs: v.array(catalogResponseSchema),
  page: pageInfoSchema,
})

export type CatalogHistoryResponse = v.InferOutput<typeof catalogHistoryResponseSchema>
