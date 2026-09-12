import type { Result } from "../schemas/resultSchema.js"
import type { R2BucketCredentialRepairPending } from "./r2BucketCredentialRepairPendingSchema.js"
import type { R2BucketCredential } from "./r2BucketCredentialSchema.js"

export type R2BucketCredentialRepairPendingRepository = {
  r2BucketCredentialRepairPendingCreate: (input: {
    bucket: string
    previousCredential: R2BucketCredential
    replacementRevocationId: string
  }) => Result<R2BucketCredentialRepairPending>
  r2BucketCredentialRepairPendingRead: (bucket: string) => Result<R2BucketCredentialRepairPending | null>
  r2BucketCredentialRepairPendingsRead: () => Result<readonly R2BucketCredentialRepairPending[]>
  r2BucketCredentialRepairPendingDelete: (bucket: string) => Result<boolean>
  r2BucketCredentialRepairClaim: (input: {
    bucket: string
    ownerId: string
    now?: number
    leaseMilliseconds?: number
  }) => Result<boolean>
  r2BucketCredentialRepairRelease: (input: { bucket: string; ownerId: string }) => Result<boolean>
}
