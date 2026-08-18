import * as v from "valibot"

export const videoProcessingRequestSchema = v.strictObject({
  sourceBytes: v.instance(Uint8Array),
  sourceName: v.optional(v.pipe(v.string(), v.minLength(1))),
})

export type VideoProcessingRequest = v.InferOutput<typeof videoProcessingRequestSchema>
