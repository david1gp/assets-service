import type { Result } from "../../schemas/resultSchema.js"
import type { StorageAdapter } from "../../storage/storageAdapter.js"
import type { StorageProbeResult } from "../../storage/storageProbeResult.js"

export const r2CredentialProbe = (adapter: StorageAdapter, bucket: string): Promise<Result<StorageProbeResult>> =>
  adapter.probeCredentials(bucket)
