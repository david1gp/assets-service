import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import * as v from "valibot"

import type { RcloneBackupRestoreAdapter } from "../../backup/rcloneBackupRestoreAdapter.js"
import { rcloneBackupRemotePathValidate } from "../../backup/rcloneBackupRemotePathValidate.js"
import {
  type RcloneBackupRestoreRequest,
  rcloneBackupRestoreRequestSchema,
} from "../../backup/rcloneBackupRestoreRequestSchema.js"
import {
  type RcloneBackupRestoreResult,
  rcloneBackupRestoreResultSchema,
} from "../../backup/rcloneBackupRestoreResultSchema.js"
import { rcloneErrorCreate } from "../../backup/rcloneErrorCreate.js"
import type { ServiceConfig } from "../../config/serviceConfigSchema.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { RcloneCommandRunner } from "./rcloneCommandRunner.js"
import { rcloneCommandRunnerProduction } from "./rcloneCommandRunnerProduction.js"

export const rcloneBackupRestoreAdapterProduction = (
  config: Pick<ServiceConfig, "rcloneExecutable" | "rcloneRemote" | "rcloneBackupRoot" | "rcloneTimeoutMs">,
  commandRunner: RcloneCommandRunner = rcloneCommandRunnerProduction,
): RcloneBackupRestoreAdapter => {
  if (config.rcloneRemote !== "gdrive_beta" || config.rcloneBackupRoot !== "backups")
    return async () =>
      rcloneErrorCreate("rcloneBackupRestoreAdapterProduction", "invalid_remote", "invalid backup remote")

  return async (input: RcloneBackupRestoreRequest, options = {}): Promise<Result<RcloneBackupRestoreResult>> => {
    const op = "rcloneBackupRestoreAdapterProduction"
    const parsed = v.safeParse(rcloneBackupRestoreRequestSchema, input)
    if (!parsed.success) return rcloneErrorCreate(op, "invalid_request", v.summarize(parsed.issues), input)
    if (!rcloneBackupRemotePathValidate(parsed.output.remotePath))
      return rcloneErrorCreate(op, "invalid_request", "backup path must use gdrive_beta:backups")
    if (options.signal?.aborted) return rcloneErrorCreate(op, "cancelled", "rclone operation was cancelled")

    let temporaryDirectory: string | undefined
    try {
      temporaryDirectory = await mkdtemp(join(tmpdir(), "assets-rclone-restore-"))
      const temporaryPath = join(temporaryDirectory, "original")
      const timeoutMs = parsed.output.timeoutMs ?? config.rcloneTimeoutMs
      const downloaded = await commandRunner({
        executable: config.rcloneExecutable,
        args: ["copyto", parsed.output.remotePath, temporaryPath],
        timeoutMs,
        signal: options.signal,
      })
      if (!downloaded.success) return downloaded
      if (downloaded.data.exitCode !== 0)
        return rcloneErrorCreate(
          op,
          "command_failed",
          "rclone could not download the backup",
          commandOutputRead(downloaded.data),
        )

      const verified = await localFileVerify(temporaryPath, parsed.output, options.signal)
      if (!verified.success) return verified
      if (options.signal?.aborted) return rcloneErrorCreate(op, "cancelled", "rclone operation was cancelled")

      await mkdir(dirname(parsed.output.destinationPath), { recursive: true })
      await rename(temporaryPath, parsed.output.destinationPath)
      const result = v.safeParse(rcloneBackupRestoreResultSchema, {
        destinationPath: parsed.output.destinationPath,
        byteSize: verified.data.byteSize,
        sha256: verified.data.sha256,
        checkResult: "verified",
      })
      if (!result.success) return rcloneErrorCreate(op, "verification_failed", v.summarize(result.issues))
      return { success: true, data: result.output }
    } catch (error) {
      return rcloneErrorCreate(op, "command_failed", "the backup could not be restored", errorMessageRead(error))
    } finally {
      if (temporaryDirectory !== undefined)
        await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

async function localFileVerify(
  path: string,
  input: Pick<RcloneBackupRestoreRequest, "expectedByteSize" | "expectedSha256">,
  signal?: AbortSignal,
): Promise<Result<{ byteSize: number; sha256: string }>> {
  const op = "rcloneBackupRestoreAdapterProductionLocalFileVerify"
  try {
    const file = Bun.file(path)
    if (!(await file.exists())) return rcloneErrorCreate(op, "source_missing", "downloaded backup does not exist")
    const hasher = createHash("sha256")
    const reader = file.stream().getReader()
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
    const sha256 = hasher.digest("hex")
    if (byteSize !== input.expectedByteSize || sha256 !== input.expectedSha256)
      return rcloneErrorCreate(op, "verification_failed", "downloaded backup size or checksum does not match")
    return { success: true, data: { byteSize, sha256 } }
  } catch (error) {
    return rcloneErrorCreate(op, "source_missing", "downloaded backup could not be read", errorMessageRead(error))
  }
}

function commandOutputRead(output: { exitCode: number; stdout: string; stderr: string }): {
  exitCode: number
  stderr?: string
} {
  const stderr = output.stderr
    .trim()
    .replace(/(password|secret|token|authorization)\s*[=:]\s*[^\s]+/gi, "$1=[REDACTED]")
  return { exitCode: output.exitCode, ...(stderr ? { stderr: stderr.slice(0, 512) } : {}) }
}

function errorMessageRead(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
