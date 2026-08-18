import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { outputFormatSchema } from "./outputFormatSchema.js"
import { outputKeySchema } from "./outputKeySchema.js"

export const imageOutputDefinitionSchema = v.strictObject({
  id: idSchema,
  assetId: idSchema,
  kind: v.literal("image"),
  key: outputKeySchema,
  width: v.pipe(v.number(), v.integer(), v.minValue(1)),
  height: v.pipe(v.number(), v.integer(), v.minValue(1)),
  format: outputFormatSchema,
  quality: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
  showAiLabel: v.optional(v.boolean()),
})

export type ImageOutputDefinition = v.InferOutput<typeof imageOutputDefinitionSchema>
