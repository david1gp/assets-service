import * as v from "valibot"

import { jsonObjectSchema } from "../schemas/jsonObjectSchema.js"
import { errorCodeSchema } from "./errorCodeSchema.js"

export const structuredErrorSchema = v.strictObject({
  code: errorCodeSchema,
  message: v.pipe(v.string(), v.minLength(1)),
  details: v.optional(jsonObjectSchema),
  retryable: v.boolean(),
})

export type StructuredError = v.InferOutput<typeof structuredErrorSchema>
