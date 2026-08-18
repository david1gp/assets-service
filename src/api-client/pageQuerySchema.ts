import * as v from "valibot"

const pageNumberSchema = v.pipe(
  v.string(),
  v.regex(/^\d+$/),
  v.transform(Number),
  v.integer(),
  v.minValue(0),
  v.maxValue(100),
)

export const pageQuerySchema = v.strictObject({
  cursor: v.optional(pageNumberSchema),
  limit: v.optional(v.pipe(pageNumberSchema, v.minValue(1))),
})

export type PageQuery = v.InferOutput<typeof pageQuerySchema>
