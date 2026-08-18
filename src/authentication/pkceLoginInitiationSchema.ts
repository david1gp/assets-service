import * as v from "valibot"

export const pkceLoginInitiationSchema = v.strictObject({
  authorizationUrl: v.pipe(v.string(), v.url()),
  state: v.pipe(v.string(), v.minLength(1)),
  stateCookie: v.pipe(v.string(), v.minLength(1)),
  expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

export type PkceLoginInitiation = v.InferOutput<typeof pkceLoginInitiationSchema>
