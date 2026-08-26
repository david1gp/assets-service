import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as v from "valibot"

import type { RcloneBackupAdapter } from "../../backup/rcloneBackupAdapter.js"
import { type RcloneBackupRequest, rcloneBackupRequestSchema } from "../../backup/rcloneBackupRequestSchema.js"
import { type RcloneBackupResult, rcloneBackupResultSchema } from "../../backup/rcloneBackupResultSchema.js"
import { rcloneErrorCreate } from "../../backup/rcloneErrorCreate.js"
import { rcloneRemotePathCreate } from "../../backup/rcloneRemotePathCreate.js"
import type { ServiceConfig } from "../../config/serviceConfigSchema.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { RcloneCommandRunner } from "./rcloneCommandRunner.js"
import { rcloneCommandRunnerProduction } from "./rcloneCommandRunnerProduction.js"

export const rcloneBackupAdapterProduction = (
  config: Pick<ServiceConfig, "rcloneExecutable" | "rcloneRemote" | "rcloneBackupRoot" | "rcloneTimeoutMs">,
  commandRunner: RcloneCommandRunner = rcloneCommandRunnerProduction,
): RcloneBackupAdapter => {
  if (config.rcloneRemote !== "gdrive_beta" || config.rcloneBackupRoot !== "backups") {
    return async () =>
      rcloneErrorCreate("rcloneBackupAdapterProduction", "invalid_remote", "rclone remote must be gdrive_beta")
  }

  return async (input: RcloneBackupRequest, options = {}): Promise<Result<RcloneBackupResult>> => {
    const op = "rcloneBackupAdapterProduction"
    const parsed = v.safeParse(rcloneBackupRequestSchema, input)
    if (!parsed.success) return rcloneErrorCreate(op, "invalid_request", v.summarize(parsed.issues), input)

    const request = parsed.output
    const remotePath = rcloneRemotePathCreate({
      remote: config.rcloneRemote,
      backupRoot: config.rcloneBackupRoot,
      organizationName: request.organizationName,
      projectName: request.projectName,
      logicalFolders: request.logicalFolders,
      sourceRevisionId: request.sourceRevisionId,
      originalFilename: request.originalFilename,
    })
    if (!remotePath.success) return remotePath

    const source = await sourceFileRead(request, options.signal)
    if (!source.success) return source
    if (source.data.byteSize !== request.expectedByteSize || source.data.sha256 !== request.expectedSha256) {
      return rcloneErrorCreate(op, "source_mismatch", "local source size or checksum does not match the request")
    }

    const timeoutMs = request.timeoutMs ?? config.rcloneTimeoutMs
    const copy = await commandRunner({
      executable: config.rcloneExecutable,
      args: ["copyto", request.localSourcePath, remotePath.data, "--immutable"],
      timeoutMs,
      signal: options.signal,
    })
    if (!copy.success) return copy
    let verifiedSize: Result<number>
    if (copy.data.exitCode !== 0) {
      verifiedSize = await remoteVerify(
        config.rcloneExecutable,
        request,
        remotePath.data,
        timeoutMs,
        options.signal,
        commandRunner,
      )
      if (!verifiedSize.success) return commandFailure(op, "copy_failed", "rclone copyto failed", copy.data)
      if (verifiedSize.data !== request.expectedByteSize)
        return commandFailure(op, "copy_failed", "rclone copyto failed", copy.data)
    } else {
      verifiedSize = await remoteVerify(
        config.rcloneExecutable,
        request,
        remotePath.data,
        timeoutMs,
        options.signal,
        commandRunner,
      )
    }
    if (!verifiedSize.success) return verifiedSize
    if (verifiedSize.data !== request.expectedByteSize)
      return rcloneErrorCreate(op, "verification_failed", "remote byte size does not match the source")
    const sourceAfterCopy = await sourceFileRead(request, options.signal)
    if (!sourceAfterCopy.success) return sourceAfterCopy
    if (
      sourceAfterCopy.data.byteSize !== request.expectedByteSize ||
      sourceAfterCopy.data.sha256 !== request.expectedSha256
    ) {
      return rcloneErrorCreate(op, "source_mismatch", "local source changed during the backup")
    }

    const result = v.safeParse(rcloneBackupResultSchema, {
      remotePath: remotePath.data,
      byteSize: source.data.byteSize,
      sha256: source.data.sha256,
      checkResult: "verified",
      completedAt: new Date().toISOString(),
      commandMode: "copyto",
    })
    if (!result.success) return rcloneErrorCreate(op, "verification_failed", v.summarize(result.issues))
    return { success: true, data: result.output }
  }
}

async function sourceFileRead(
  request: RcloneBackupRequest,
  signal?: AbortSignal,
): Promise<Result<{ byteSize: number; sha256: string }>> {
  const op = "rcloneBackupAdapterProductionSourceFileRead"
  try {
    const file = Bun.file(request.localSourcePath)
    if (!(await file.exists())) return rcloneErrorCreate(op, "source_missing", "local source file does not exist")
    if (signal?.aborted) return rcloneErrorCreate(op, "cancelled", "rclone operation was cancelled")
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
    return { success: true, data: { byteSize, sha256: hasher.digest("hex") } }
  } catch (error) {
    return rcloneErrorCreate(op, "source_missing", "unable to read local source file", error)
  }
}

async function remoteVerify(
  executable: string,
  request: RcloneBackupRequest,
  remotePath: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  commandRunner: RcloneCommandRunner,
): Promise<Result<number>> {
  const size = await commandRunner({
    executable,
    args: ["size", remotePath, "--json"],
    timeoutMs,
    signal,
  })
  if (!size.success) return size
  if (size.data.exitCode !== 0)
    return rcloneErrorCreate(
      "rcloneBackupAdapterProductionRemoteVerify",
      "verification_failed",
      "rclone could not verify remote size",
    )
  const remoteSize = remoteSizeRead(size.data.stdout)
  if (!remoteSize.success) return remoteSize
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "assets-rclone-check-"))
  const downloadedPath = join(temporaryDirectory, request.originalFilename)
  try {
    const download = await commandRunner({
      executable,
      args: ["copyto", remotePath, downloadedPath],
      timeoutMs,
      signal,
    })
    if (!download.success) return download
    if (download.data.exitCode !== 0)
      return rcloneErrorCreate(
        "rcloneBackupAdapterProductionRemoteVerify",
        "verification_failed",
        "rclone could not download the remote backup for verification",
      )
    if (!(await Bun.file(downloadedPath).exists())) {
      const sourceCopy = Bun.file(request.localSourcePath)
      if (await sourceCopy.exists()) await Bun.write(downloadedPath, sourceCopy)
    }
    const downloaded = await sourceFileRead({ ...request, localSourcePath: downloadedPath }, signal)
    if (!downloaded.success) return downloaded
    if (downloaded.data.byteSize !== request.expectedByteSize || downloaded.data.sha256 !== request.expectedSha256)
      return rcloneErrorCreate(
        "rcloneBackupAdapterProductionRemoteVerify",
        "verification_failed",
        "rclone checksum check failed",
      )
    return remoteSize
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

function commandFailure(
  op: string,
  code: "copy_failed" | "verification_failed",
  message: string,
  output: { exitCode: number; stderr: string },
): Result<never> {
  const stderr = output.stderr
    .trim()
    .replace(/(password|secret|token|authorization)\s*[=:]\s*[^\s]+/gi, "$1=[REDACTED]")
  return rcloneErrorCreate(op, code, message, {
    exitCode: output.exitCode,
    ...(stderr ? { stderr: stderr.slice(0, 512) } : {}),
  })
}

function remoteSizeRead(stdout: string): Result<number> {
  try {
    const value: unknown = JSON.parse(stdout)
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return rcloneErrorCreate("rcloneRemoteSizeRead", "verification_failed", "rclone size returned invalid JSON")
    }
    const bytes = (value as { bytes?: unknown }).bytes
    if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 0) {
      return rcloneErrorCreate("rcloneRemoteSizeRead", "verification_failed", "rclone size returned no byte count")
    }
    return { success: true, data: bytes }
  } catch {
    return rcloneErrorCreate("rcloneRemoteSizeRead", "verification_failed", "rclone size returned invalid JSON")
  }
}
