import * as v from "valibot"

import { catalogFontSchema } from "./catalogFontSchema.js"
import { catalogImageSchema } from "./catalogImageSchema.js"
import { catalogVideoSchema } from "./catalogVideoSchema.js"

export const catalogEntrySchema = v.variant("class", [catalogImageSchema, catalogVideoSchema, catalogFontSchema])

export type CatalogEntry = v.InferOutput<typeof catalogEntrySchema>
