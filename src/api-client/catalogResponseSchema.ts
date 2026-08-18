import * as v from "valibot"

import { catalogSchema } from "../catalog/catalogSchema.js"

export const catalogResponseSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1)),
  generationId: v.pipe(v.string(), v.minLength(1)),
  current: v.boolean(),
  catalog: catalogSchema,
})

export type CatalogResponse = v.InferOutput<typeof catalogResponseSchema>
