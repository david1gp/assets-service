import * as v from "valibot"

import { catalogDocumentSchema } from "./catalogDocumentSchema.js"
import { catalogFontSchema } from "./catalogFontSchema.js"
import { catalogImageSchema } from "./catalogImageSchema.js"
import { catalogVideoSchema } from "./catalogVideoSchema.js"

export const catalogEntrySchema = v.variant("class", [
  catalogImageSchema,
  catalogVideoSchema,
  catalogFontSchema,
  catalogDocumentSchema,
])

export type CatalogEntry = v.InferOutput<typeof catalogEntrySchema>
