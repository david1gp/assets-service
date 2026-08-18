import * as v from "valibot"

export const zitadelOidcDiscoverySchema = v.strictObject({
  issuer: v.pipe(v.string(), v.url()),
  authorization_endpoint: v.pipe(v.string(), v.url()),
  token_endpoint: v.pipe(v.string(), v.url()),
  jwks_uri: v.pipe(v.string(), v.url()),
})

export type ZitadelOidcDiscovery = v.InferOutput<typeof zitadelOidcDiscoverySchema>
