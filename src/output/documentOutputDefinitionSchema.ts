import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"

export const documentOutputDefinitionSchema = v.strictObject({
  id: idSchema,
  assetId: idSchema,
  kind: v.literal("document"),
  key: v.literal("default"),
})

export type DocumentOutputDefinition = v.InferOutput<typeof documentOutputDefinitionSchema>
