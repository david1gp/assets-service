import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import type { Result } from "../schemas/resultSchema.js"
import type { R2BucketCredentialCreateInput } from "./r2BucketCredentialCreateInputSchema.js"
import type { R2BucketCredential } from "./r2BucketCredentialSchema.js"

export type R2BucketCredentialRepository = {
  r2BucketCredentialCreate: (
    input: R2BucketCredentialCreateInput,
    transaction?: AssetDatabase,
  ) => Result<R2BucketCredential>
  r2BucketCredentialRead: (bucket: string, transaction?: AssetDatabase) => Result<R2BucketCredential | null>
  r2BucketCredentialsRead: (transaction?: AssetDatabase) => Result<readonly R2BucketCredential[]>
  r2BucketCredentialDelete: (bucket: string, transaction?: AssetDatabase) => Result<boolean>
}
