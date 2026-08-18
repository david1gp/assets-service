import * as v from "valibot"

export const fontMetadataSchema = v.strictObject({
  kind: v.literal("font"),
  family: v.pipe(v.string(), v.minLength(1)),
  style: v.pipe(v.string(), v.minLength(1)),
  weight: v.pipe(v.number(), v.integer(), v.minValue(1)),
  width: v.pipe(v.number(), v.integer(), v.minValue(1)),
  variableAxes: v.array(v.pipe(v.string(), v.minLength(1))),
  glyphCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  unicodeRanges: v.array(v.pipe(v.string(), v.minLength(1))),
  format: v.pipe(v.string(), v.minLength(1)),
  license: v.optional(
    v.strictObject({
      name: v.optional(v.string()),
      url: v.optional(v.pipe(v.string(), v.url())),
      text: v.optional(v.string()),
    }),
  ),
})

export type FontMetadata = v.InferOutput<typeof fontMetadataSchema>
