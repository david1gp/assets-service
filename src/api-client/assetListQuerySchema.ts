import * as v from "valibot"

import { assetClassSchema } from "../schemas/assetClassSchema.js"
import { pageQuerySchema } from "./pageQuerySchema.js"

export const assetListQuerySchema = v.strictObject({
  ...pageQuerySchema.entries,
  class: v.optional(assetClassSchema),
  include: v.optional(v.pipe(v.string(), v.maxLength(128))),
  search: v.optional(v.pipe(v.string(), v.maxLength(255))),
  folder: v.optional(v.pipe(v.string(), v.maxLength(255))),
})

export type AssetListQuery = v.InferOutput<typeof assetListQuerySchema>
