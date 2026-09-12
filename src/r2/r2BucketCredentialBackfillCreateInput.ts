import type { Result } from "../schemas/resultSchema.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import type { R2BucketCredentialCreateInput } from "./r2BucketCredentialCreateInputSchema.js"
import type { R2BucketCredentialRepository } from "./r2BucketCredentialRepository.js"

export type R2BucketCredentialBackfillCreateInput = {
  liveStorageBindingsRead: () => Result<readonly StorageBinding[]>
  r2BucketCredentialRepository: Pick<
    R2BucketCredentialRepository,
    "r2BucketCredentialsRead" | "r2BucketCredentialCreate"
  >
  r2BucketCredentialCreate?: (input: {
    accountId: string
    apiToken: string
    bucket: string
    name?: string
  }) => Promise<Result<R2BucketCredentialCreateInput>>
  backfillLogger?: (entry: {
    event: "phase" | "skip" | "plan" | "create" | "error"
    operation: "r2BucketCredentialBackfill"
    phase: "discover" | "cloudflare" | "persist" | "complete"
    bucket?: string
    dryRun: boolean
    error?: string
  }) => void
}
