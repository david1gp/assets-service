import type { CloudflareRequestCredentials } from "../cloudflare/cloudflareRequestCredentialsSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { R2BucketCredentialBackfillResult } from "./r2BucketCredentialBackfillResultSchema.js"

export type R2BucketCredentialBackfill = {
  r2BucketCredentialBackfill: (
    credentials: CloudflareRequestCredentials,
    dryRun?: boolean,
  ) => Promise<Result<R2BucketCredentialBackfillResult>>
}
