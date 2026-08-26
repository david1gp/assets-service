import type { Result } from "../schemas/resultSchema.js"

export type BackupRemotePathMigrationAdapter = {
  remoteObjectVerify: (input: {
    remotePath: string
    expectedByteSize: number
    expectedSha256: string
    signal?: AbortSignal
  }) => Promise<Result<"missing" | "verified" | "mismatch">>
  remoteObjectCopyImmutable: (input: {
    sourceRemotePath: string
    destinationRemotePath: string
    signal?: AbortSignal
  }) => Promise<Result<null>>
}
