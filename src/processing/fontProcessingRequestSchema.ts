import * as v from "valibot"

import { fontOutputFormatSchema } from "./fontOutputFormatSchema.js"

export const fontProcessingRequestSchema = v.strictObject({
  sourceBytes: v.instance(Uint8Array),
  sourceName: v.optional(v.pipe(v.string(), v.minLength(1))),
  outputFormat: v.optional(fontOutputFormatSchema),
})

export type FontProcessingRequest = v.InferOutput<typeof fontProcessingRequestSchema>
