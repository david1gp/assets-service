import type { Result } from "../schemas/resultSchema.js"
import type { R2BucketCredential } from "./r2BucketCredentialSchema.js"

export type R2BucketCredentialRepairRecoveryRepository = {
  r2BucketCredentialRepairRecoveryRestorePreviousAndDeletePending: (input: {
    bucket: string
    previousCredential: R2BucketCredential
    expectedCurrentCredential?: R2BucketCredential
  }) => Result<R2BucketCredential>
}
