import * as v from "valibot"

export const cloudflareRequestCredentialsSchema = v.strictObject({
  accountId: v.pipe(v.string(), v.minLength(1)),
  apiToken: v.pipe(v.string(), v.minLength(1)),
})

export type CloudflareRequestCredentials = v.InferOutput<typeof cloudflareRequestCredentialsSchema>
