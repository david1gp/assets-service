import type { Result } from "../schemas/resultSchema.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import type { R2BucketCredentialRepairPending } from "./r2BucketCredentialRepairPendingSchema.js"
import type { R2BucketCredential } from "./r2BucketCredentialSchema.js"

export type R2BucketCredentialRepairPendingRepository = {
  r2BucketCredentialRepairPendingCreate: (
    input: {
      bucket: string
      previousCredential: R2BucketCredential
      replacementRevocationId: string
    },
    transaction?: AssetDatabase,
  ) => Result<R2BucketCredentialRepairPending>
  r2BucketCredentialRepairPendingRead: (
    bucket: string,
    transaction?: AssetDatabase,
  ) => Result<R2BucketCredentialRepairPending | null>
  r2BucketCredentialRepairPendingsRead: (
    transaction?: AssetDatabase,
  ) => Result<readonly R2BucketCredentialRepairPending[]>
  r2BucketCredentialRepairPendingDelete: (bucket: string, transaction?: AssetDatabase) => Result<boolean>
  r2BucketCredentialRepairClaim: (
    input: {
      bucket: string
      ownerId: string
      now?: number
      leaseMilliseconds?: number
    },
    transaction?: AssetDatabase,
  ) => Result<boolean>
  r2BucketCredentialRepairRelease: (
    input: { bucket: string; ownerId: string },
    transaction?: AssetDatabase,
  ) => Result<boolean>
}
