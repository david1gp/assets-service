import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import type { Result } from "../schemas/resultSchema.js"
import type { R2BucketCredentialRepository } from "./r2BucketCredentialRepository.js"
import type { R2BucketCredentialRepairPendingRepository } from "./r2BucketCredentialRepairPendingRepository.js"
import type { R2BucketCredential } from "./r2BucketCredentialSchema.js"
import type { R2BucketCredentialRepairRecoveryRepository } from "./r2BucketCredentialRepairRecoveryRepository.js"

export const r2BucketCredentialRepairRecoveryRepositoryCreate = (
  db: AssetDatabase,
  r2BucketCredentialRepository: Pick<
    R2BucketCredentialRepository,
    "r2BucketCredentialCreate" | "r2BucketCredentialRead"
  >,
  r2BucketCredentialRepairPendingRepository: Pick<
    R2BucketCredentialRepairPendingRepository,
    "r2BucketCredentialRepairPendingDelete"
  >,
): R2BucketCredentialRepairRecoveryRepository => {
  const r2BucketCredentialRepairRecoveryRestorePreviousAndDeletePending = ({
    bucket,
    previousCredential,
    expectedCurrentCredential,
  }: {
    bucket: string
    previousCredential: R2BucketCredential
    expectedCurrentCredential?: R2BucketCredential
  }): Result<R2BucketCredential> =>
    databaseTransactionRun(
      db,
      (transaction) => {
        if (expectedCurrentCredential !== undefined) {
          const current = r2BucketCredentialRepository.r2BucketCredentialRead(bucket, transaction)
          if (!current.success) return current
          if (current.data === null || !credentialEquals(current.data, expectedCurrentCredential)) {
            return {
              success: false,
              op: "r2BucketCredentialRepairRecoveryRestorePreviousAndDeletePending",
              errorMessage: "The current R2 credential changed during recovery",
            }
          }
        }
        const restored = r2BucketCredentialRepository.r2BucketCredentialCreate(
          {
            bucket: previousCredential.bucket,
            accessKeyId: previousCredential.accessKeyId,
            secretAccessKey: previousCredential.secretAccessKey,
            revocationId: previousCredential.revocationId,
          },
          transaction,
        )
        if (!restored.success) return restored
        if (restored.data.bucket !== bucket) {
          return {
            success: false,
            op: "r2BucketCredentialRepairRecoveryRestorePreviousAndDeletePending",
            errorMessage: "The restored R2 credential bucket did not match",
          }
        }
        const deleted = r2BucketCredentialRepairPendingRepository.r2BucketCredentialRepairPendingDelete(
          bucket,
          transaction,
        )
        if (!deleted.success) return deleted
        return restored
      },
      { behavior: "immediate" },
    )

  return { r2BucketCredentialRepairRecoveryRestorePreviousAndDeletePending }
}

function credentialEquals(left: R2BucketCredential, right: R2BucketCredential): boolean {
  return (
    left.bucket === right.bucket &&
    left.accessKeyId === right.accessKeyId &&
    left.secretAccessKey === right.secretAccessKey &&
    left.revocationId === right.revocationId &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  )
}
