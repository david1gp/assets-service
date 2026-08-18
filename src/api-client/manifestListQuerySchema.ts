import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { pageQuerySchema } from "./pageQuerySchema.js"

export const manifestListQuerySchema = v.strictObject({
  ...pageQuerySchema.entries,
  assetId: v.optional(idSchema),
  generationId: v.optional(idSchema),
  kind: v.optional(v.picklist(["asset", "catalog", "deletion"])),
})

export type ManifestListQuery = v.InferOutput<typeof manifestListQuerySchema>
