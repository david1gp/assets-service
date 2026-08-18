import * as v from "valibot"

export const pageInfoSchema = v.strictObject({
  limit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
  nextCursor: v.nullable(v.pipe(v.string(), v.regex(/^\d+$/))),
})

export type PageInfo = v.InferOutput<typeof pageInfoSchema>
