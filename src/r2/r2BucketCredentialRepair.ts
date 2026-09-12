import type { R2BucketCredentialRepairResult } from "./r2BucketCredentialRepairResultSchema.js"
import type { CloudflareRequestCredentials } from "../cloudflare/cloudflareRequestCredentialsSchema.js"
import type { Result } from "../schemas/resultSchema.js"

export type R2BucketCredentialRepair = {
  r2BucketCredentialRepair: (
    credentials: CloudflareRequestCredentials,
  ) => Promise<Result<R2BucketCredentialRepairResult>>
}
