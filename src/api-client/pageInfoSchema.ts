import * as v from "valibot"

export const pageInfoSchema = v.strictObject({
  limit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
  nextCursor: v.nullable(v.pipe(v.string(), v.regex(/^\d+$/))),
  /** Total number of items matching the filters, before the page slice. Only sent by routes that know it. */
  total: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
})

export type PageInfo = v.InferOutput<typeof pageInfoSchema>
