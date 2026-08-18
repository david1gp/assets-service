import * as v from "valibot"

export const tokenResponseSchema = v.strictObject({
  access_token: v.pipe(v.string(), v.minLength(1)),
  token_type: v.pipe(v.string(), v.minLength(1)),
  expires_in: v.pipe(v.number(), v.integer(), v.minValue(1)),
  id_token: v.optional(v.pipe(v.string(), v.minLength(1))),
  refresh_token: v.optional(v.pipe(v.string(), v.minLength(1))),
  scope: v.optional(v.pipe(v.string(), v.minLength(1))),
})

export type TokenResponse = v.InferOutput<typeof tokenResponseSchema>
