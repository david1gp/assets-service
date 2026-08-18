import * as v from "valibot"

import { fontOutputFormatSchema } from "../processing/fontOutputFormatSchema.js"
import { outputFormatSchema } from "../output/outputFormatSchema.js"
import { outputKeySchema } from "../output/outputKeySchema.js"

const imageOutputDefinitionInputSchema = v.strictObject({
  kind: v.literal("image"),
  key: outputKeySchema,
  width: v.pipe(v.number(), v.integer(), v.minValue(1)),
  height: v.pipe(v.number(), v.integer(), v.minValue(1)),
  format: outputFormatSchema,
  quality: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
  showAiLabel: v.optional(v.boolean()),
})

const videoOutputDefinitionInputSchema = v.strictObject({
  kind: v.literal("video"),
  key: outputKeySchema,
})

const fontOutputDefinitionInputSchema = v.strictObject({
  kind: v.literal("font"),
  key: outputKeySchema,
  format: fontOutputFormatSchema,
})

export const outputDefinitionInputSchema = v.variant("kind", [
  imageOutputDefinitionInputSchema,
  videoOutputDefinitionInputSchema,
  fontOutputDefinitionInputSchema,
])

export type OutputDefinitionInput = v.InferOutput<typeof outputDefinitionInputSchema>
