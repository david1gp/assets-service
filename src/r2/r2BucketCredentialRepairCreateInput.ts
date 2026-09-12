import type { R2BucketCredentialCreateInput } from "./r2BucketCredentialCreateInputSchema.js"
import type { R2BucketCredentialRepository } from "./r2BucketCredentialRepository.js"
import type { R2BucketCredentialRepairPendingRepository } from "./r2BucketCredentialRepairPendingRepository.js"
import type { R2BucketCredentialRepairRecoveryRepository } from "./r2BucketCredentialRepairRecoveryRepository.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import type { StorageProbeResult } from "../storage/storageProbeResult.js"
import type { Result } from "../schemas/resultSchema.js"

export type R2BucketCredentialRepairCreateInput = {
  liveStorageBindingsRead: () => Result<readonly StorageBinding[]>
  r2BucketCredentialRepository: Pick<
    R2BucketCredentialRepository,
    "r2BucketCredentialRead" | "r2BucketCredentialCreate"
  >
  r2BucketCredentialRepairPendingRepository: R2BucketCredentialRepairPendingRepository
  r2BucketCredentialRepairRecoveryRepository?: R2BucketCredentialRepairRecoveryRepository
  credentialProbe: (
    bucket: string,
    credential?: Pick<R2BucketCredentialCreateInput, "accessKeyId" | "secretAccessKey">,
  ) => Promise<Result<StorageProbeResult>>
  r2BucketCredentialCreate?: (input: {
    accountId: string
    apiToken: string
    bucket: string
    name?: string
  }) => Promise<Result<R2BucketCredentialCreateInput>>
  r2BucketCredentialRevoke?: (input: {
    accountId: string
    apiToken: string
    revocationId: string
  }) => Promise<Result<boolean>>
  repairLogger?: (entry: {
    event: "phase" | "skip" | "create" | "persist" | "verify" | "revoke" | "error"
    operation: "r2BucketCredentialRepair"
    phase: "discover" | "probe" | "cloudflare" | "persist" | "verify" | "rollback" | "revoke" | "complete"
    bucket?: string
    recovery?: string
    error?: string
  }) => void
}
