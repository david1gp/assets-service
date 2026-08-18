import * as v from "valibot"

export const outputFormatSchema = v.picklist(["jpg", "png", "webp", "avif"])

export type OutputFormat = v.InferOutput<typeof outputFormatSchema>
