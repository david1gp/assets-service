import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { rcloneErrorCreate } from "../backup/rcloneErrorCreate.js"
import type { ServiceConfig } from "../config/serviceConfigSchema.js"
import type { RcloneCommandRunner } from "../infrastructure/rclone/rcloneCommandRunner.js"
import { rcloneCommandRunnerProduction } from "../infrastructure/rclone/rcloneCommandRunnerProduction.js"
import type { Result } from "../schemas/resultSchema.js"
import type { BackupRemotePathMigrationAdapter } from "./backupRemotePathMigrationAdapter.js"

export const rcloneBackupRemotePathMigrationAdapterProduction = (
  config: Pick<ServiceConfig, "rcloneExecutable" | "rcloneRemote" | "rcloneBackupRoot" | "rcloneTimeoutMs">,
  commandRunner: RcloneCommandRunner = rcloneCommandRunnerProduction,
): BackupRemotePathMigrationAdapter => {
  if (config.rcloneRemote !== "gdrive_beta" || config.rcloneBackupRoot !== "backups") {
    return {
      remoteObjectVerify: async () =>
        rcloneErrorCreate(
          "rcloneBackupRemotePathMigrationAdapterProduction",
          "invalid_remote",
          "rclone remote must be gdrive_beta and backup root must be backups",
        ),
      remoteObjectCopyImmutable: async () =>
        rcloneErrorCreate(
          "rcloneBackupRemotePathMigrationAdapterProduction",
          "invalid_remote",
          "rclone remote must be gdrive_beta and backup root must be backups",
        ),
    }
  }

  const remoteObjectVerify: BackupRemotePathMigrationAdapter["remoteObjectVerify"] = async (input) => {
    const op = "rcloneBackupRemotePathMigrationAdapterProductionRemoteObjectVerify"
    const size = await commandRunner({
      executable: config.rcloneExecutable,
      args: ["size", input.remotePath, "--json"],
      timeoutMs: config.rcloneTimeoutMs,
      signal: input.signal,
    })
    if (!size.success) return size
    if (size.data.exitCode !== 0) {
      if (remoteObjectMissingRead(size.data.exitCode)) return { success: true, data: "missing" }
      return rcloneErrorCreate(
        op,
        "remote_unavailable",
        "rclone could not read the remote object",
        commandOutputRead(size.data),
      )
    }
    const remoteSize = remoteSizeRead(size.data.stdout)
    if (!remoteSize.success) return remoteSize

    const temporaryDirectory = await temporaryDirectoryCreate()
    if (!temporaryDirectory.success) return temporaryDirectory
    const downloadedPath = join(temporaryDirectory.data, "object")
    try {
      const download = await commandRunner({
        executable: config.rcloneExecutable,
        args: ["copyto", input.remotePath, downloadedPath],
        timeoutMs: config.rcloneTimeoutMs,
        signal: input.signal,
      })
      if (!download.success) return download
      if (download.data.exitCode !== 0) {
        if (remoteObjectMissingRead(download.data.exitCode)) return { success: true, data: "missing" }
        return rcloneErrorCreate(
          op,
          "verification_failed",
          "rclone could not download the remote object",
          commandOutputRead(download.data),
        )
      }
      const digest = await localFileDigestRead(downloadedPath, input.signal)
      if (!digest.success) return digest
      return remoteSize.data === input.expectedByteSize &&
        digest.data.byteSize === input.expectedByteSize &&
        digest.data.sha256 === input.expectedSha256
        ? { success: true, data: "verified" }
        : { success: true, data: "mismatch" }
    } finally {
      await rm(temporaryDirectory.data, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  const remoteObjectCopyImmutable: BackupRemotePathMigrationAdapter["remoteObjectCopyImmutable"] = async (input) => {
    const op = "rcloneBackupRemotePathMigrationAdapterProductionRemoteObjectCopyImmutable"
    const copy = await commandRunner({
      executable: config.rcloneExecutable,
      args: ["copyto", input.sourceRemotePath, input.destinationRemotePath, "--immutable"],
      timeoutMs: config.rcloneTimeoutMs,
      signal: input.signal,
    })
    if (!copy.success) return copy
    if (copy.data.exitCode !== 0)
      return rcloneErrorCreate(
        op,
        "copy_failed",
        "rclone could not copy the remote object",
        commandOutputRead(copy.data),
      )
    return { success: true, data: null }
  }

  return { remoteObjectVerify, remoteObjectCopyImmutable }
}

function remoteObjectMissingRead(exitCode: number): boolean {
  // rclone documents exit code 3 as "directory not found" and 4 as "file not found".
  return exitCode === 3 || exitCode === 4
}

function commandOutputRead(output: { exitCode: number; stderr: string }): { exitCode: number; stderr?: string } {
  const stderr = output.stderr
    .trim()
    .replace(/(password|secret|token|authorization)\s*[=:]\s*[^\s]+/gi, "$1=[REDACTED]")
  return { exitCode: output.exitCode, ...(stderr.length === 0 ? {} : { stderr: stderr.slice(0, 512) }) }
}

function remoteSizeRead(stdout: string): Result<number> {
  const op = "rcloneBackupRemotePathMigrationAdapterProductionRemoteSizeRead"
  try {
    const value: unknown = JSON.parse(stdout)
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return rcloneErrorCreate(op, "verification_failed", "rclone size returned invalid JSON")
    const bytes = (value as { bytes?: unknown }).bytes
    if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 0)
      return rcloneErrorCreate(op, "verification_failed", "rclone size returned no byte count")
    return { success: true, data: bytes }
  } catch {
    return rcloneErrorCreate(op, "verification_failed", "rclone size returned invalid JSON")
  }
}

async function temporaryDirectoryCreate(): Promise<Result<string>> {
  const op = "rcloneBackupRemotePathMigrationAdapterProductionTemporaryDirectoryCreate"
  try {
    return { success: true, data: await mkdtemp(join(tmpdir(), "assets-rclone-migration-")) }
  } catch (error) {
    return rcloneErrorCreate(op, "verification_failed", "unable to create a temporary directory", error)
  }
}

async function localFileDigestRead(
  path: string,
  signal?: AbortSignal,
): Promise<Result<{ byteSize: number; sha256: string }>> {
  const op = "rcloneBackupRemotePathMigrationAdapterProductionLocalFileDigestRead"
  try {
    const file = Bun.file(path)
    if (!(await file.exists()))
      return rcloneErrorCreate(op, "verification_failed", "downloaded remote object is missing")
    if (signal?.aborted) return rcloneErrorCreate(op, "cancelled", "rclone operation was cancelled")
    const reader = file.stream().getReader()
    const hasher = createHash("sha256")
    let byteSize = 0
    try {
      while (true) {
        if (signal?.aborted) return rcloneErrorCreate(op, "cancelled", "rclone operation was cancelled")
        const next = await reader.read()
        if (next.done) break
        byteSize += next.value.byteLength
        hasher.update(next.value)
      }
    } finally {
      reader.releaseLock()
    }
    return { success: true, data: { byteSize, sha256: hasher.digest("hex") } }
  } catch (error) {
    return rcloneErrorCreate(op, "verification_failed", "unable to hash the downloaded remote object", error)
  }
}
