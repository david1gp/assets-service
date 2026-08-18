import * as v from "valibot"

import { structuredErrorSchema } from "./structuredErrorSchema.js"

const apiSuccessEnvelopeSchema = v.strictObject({
  ok: v.literal(true),
  data: v.unknown(),
  requestId: v.optional(v.string()),
})

const apiFailureEnvelopeSchema = v.strictObject({
  ok: v.literal(false),
  error: structuredErrorSchema,
  requestId: v.optional(v.string()),
})

export const jsonEnvelopeSchema = v.union([apiSuccessEnvelopeSchema, apiFailureEnvelopeSchema])

export type JsonEnvelope = v.InferOutput<typeof jsonEnvelopeSchema>
