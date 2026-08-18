import * as v from "valibot"

import { aiProvenanceSchema } from "./aiProvenanceSchema.js"

export const imageMetadataSchema = v.strictObject({
  kind: v.literal("image"),
  width: v.pipe(v.number(), v.integer(), v.minValue(1)),
  height: v.pipe(v.number(), v.integer(), v.minValue(1)),
  format: v.picklist(["jpg", "png", "webp", "avif"]),
  colorSpace: v.pipe(v.string(), v.minLength(1)),
  alpha: v.boolean(),
  orientationApplied: v.boolean(),
  frameCount: v.pipe(v.number(), v.integer(), v.minValue(1)),
  animated: v.boolean(),
  alt: v.nullable(v.string()),
  aiProvenance: aiProvenanceSchema,
  showAiLabel: v.optional(v.boolean()),
})

export type ImageMetadata = v.InferOutput<typeof imageMetadataSchema>
