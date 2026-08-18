import * as v from "valibot"

export const jobActionRequestSchema = v.strictObject({
  reason: v.optional(v.pipe(v.string(), v.maxLength(1000))),
})

export type JobActionRequest = v.InferOutput<typeof jobActionRequestSchema>
