import * as v from "valibot"

import { catalogResponseSchema } from "../../api-client/catalogResponseSchema.js"
import { generatedListsResponseSchema } from "../../api-client/generatedListsResponseSchema.js"

export const uiCatalogViewSchema = v.union([
  v.strictObject({ catalog: catalogResponseSchema, lists: generatedListsResponseSchema }),
  v.strictObject({ catalog: v.null(), lists: v.null() }),
])

export type UiCatalogView = v.InferOutput<typeof uiCatalogViewSchema>
