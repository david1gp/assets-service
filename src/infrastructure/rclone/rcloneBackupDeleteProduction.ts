import * as v from "valibot"
import type { RcloneBackupDeleteAdapter } from "../../backup/rcloneBackupDeleteAdapter.js"
import { rcloneErrorCreate } from "../../backup/rcloneErrorCreate.js"
import type { ServiceConfig } from "../../config/serviceConfigSchema.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { RcloneCommandRunner } from "./rcloneCommandRunner.js"
import { rcloneCommandRunnerProduction } from "./rcloneCommandRunnerProduction.js"

export const rcloneBackupDeleteProduction = (
  config: Pick<ServiceConfig, "rcloneExecutable" | "rcloneRemote" | "rcloneBackupRoot" | "rcloneTimeoutMs">,
  commandRunner: RcloneCommandRunner = rcloneCommandRunnerProduction,
): RcloneBackupDeleteAdapter => {
  return async (remotePath, options = {}): Promise<Result<void>> => {
    const op = "rcloneBackupDeleteProduction"
    if (config.rcloneRemote !== "gdrive_beta" || config.rcloneBackupRoot !== "backups")
      return rcloneErrorCreate(op, "invalid_remote", "rclone remote must be gdrive_beta")
    if (typeof remotePath !== "string" || !remotePath.startsWith("gdrive_beta:"))
      return rcloneErrorCreate(op, "invalid_request", "backup path must use gdrive_beta")

    const parsedPath = v.safeParse(v.pipe(v.string(), v.minLength("gdrive_beta:".length + 1)), remotePath)
    if (!parsedPath.success) return rcloneErrorCreate(op, "invalid_request", "backup path is invalid")
    const result = await commandRunner({
      executable: config.rcloneExecutable,
      args: ["deletefile", parsedPath.output],
      timeoutMs: config.rcloneTimeoutMs,
      signal: options.signal,
    })
    if (!result.success) return result
    if (result.data.exitCode === 0) return { success: true, data: undefined }
    if (/not found|does not exist|not exist|object not found|file not found/i.test(result.data.stderr))
      return { success: true, data: undefined }
    const stderr = result.data.stderr
      .trim()
      .replace(/(password|secret|token|authorization)\s*[=:]\s*[^\s]+/gi, "$1=[REDACTED]")
    return rcloneErrorCreate(op, "command_failed", "rclone could not delete the backup", {
      exitCode: result.data.exitCode,
      ...(stderr ? { stderr: stderr.slice(0, 512) } : {}),
    })
  }
}
