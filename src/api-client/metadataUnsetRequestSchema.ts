import * as v from "valibot"

export const metadataUnsetRequestSchema = v.strictObject({
  field: v.literal("alt"),
})

export type MetadataUnsetRequest = v.InferOutput<typeof metadataUnsetRequestSchema>
