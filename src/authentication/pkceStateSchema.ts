import * as v from "valibot"

export const pkceStateSchema = v.strictObject({
  codeVerifier: v.pipe(v.string(), v.minLength(43), v.maxLength(128)),
  nonce: v.pipe(v.string(), v.minLength(16), v.maxLength(256)),
  returnTo: v.pipe(v.string(), v.minLength(1), v.maxLength(2048)),
  createdAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
  expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

export type PkceState = v.InferOutput<typeof pkceStateSchema>
