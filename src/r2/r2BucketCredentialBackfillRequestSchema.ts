import * as v from "valibot"

import { cloudflareRequestCredentialsSchema } from "../cloudflare/cloudflareRequestCredentialsSchema.js"

export const r2BucketCredentialBackfillRequestSchema = v.strictObject({
  ...cloudflareRequestCredentialsSchema.entries,
  dryRun: v.optional(v.boolean(), false),
})

export type R2BucketCredentialBackfillRequest = v.InferOutput<typeof r2BucketCredentialBackfillRequestSchema>
