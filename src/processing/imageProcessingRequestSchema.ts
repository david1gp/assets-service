import * as v from "valibot"

import { aiLabelOptionsSchema } from "../metadata/aiLabelOptionsSchema.js"
import { aiProvenanceSchema } from "../metadata/aiProvenanceSchema.js"
import { outputFormatSchema } from "../output/outputFormatSchema.js"

export const imageProcessingRequestSchema = v.strictObject({
  sourceBytes: v.instance(Uint8Array),
  width: v.pipe(v.number(), v.integer(), v.minValue(1)),
  height: v.pipe(v.number(), v.integer(), v.minValue(1)),
  format: v.optional(outputFormatSchema),
  quality: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
  alt: v.optional(v.nullable(v.string())),
  aiProvenance: v.optional(aiProvenanceSchema),
  showAiLabel: v.optional(v.boolean()),
  aiLabelOptions: v.optional(aiLabelOptionsSchema),
})

export type ImageProcessingRequest = v.InferOutput<typeof imageProcessingRequestSchema>
