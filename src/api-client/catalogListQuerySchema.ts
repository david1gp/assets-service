import * as v from "valibot"

import { pageQuerySchema } from "./pageQuerySchema.js"

export const catalogListQuerySchema = v.strictObject({
  ...pageQuerySchema.entries,
  generationId: v.optional(v.pipe(v.string(), v.minLength(1))),
})

export type CatalogListQuery = v.InferOutput<typeof catalogListQuerySchema>
