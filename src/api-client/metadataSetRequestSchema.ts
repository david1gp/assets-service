import * as v from "valibot"

export const metadataSetRequestSchema = v.strictObject({
  alt: v.pipe(v.string(), v.maxLength(10000)),
})

export type MetadataSetRequest = v.InferOutput<typeof metadataSetRequestSchema>
