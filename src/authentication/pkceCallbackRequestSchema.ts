import * as v from "valibot"

export const pkceCallbackRequestSchema = v.union([
  v.strictObject({
    code: v.pipe(v.string(), v.minLength(1)),
    state: v.pipe(v.string(), v.minLength(1)),
  }),
  v.strictObject({
    error: v.pipe(v.string(), v.minLength(1)),
    error_description: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(512))),
    state: v.pipe(v.string(), v.minLength(1)),
  }),
])

export type PkceCallbackRequest = v.InferOutput<typeof pkceCallbackRequestSchema>
