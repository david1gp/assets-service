import * as v from "valibot"

import type { ServiceConfig } from "../config/serviceConfigSchema.js"
import type { RcloneCommandRunner } from "../infrastructure/rclone/rcloneCommandRunner.js"
import { rcloneCommandRunnerProduction } from "../infrastructure/rclone/rcloneCommandRunnerProduction.js"
import type { Result } from "../schemas/resultSchema.js"
import { type RcloneDoctorResult, rcloneDoctorResultSchema } from "./rcloneDoctorResultSchema.js"
import { rcloneErrorCreate } from "./rcloneErrorCreate.js"

export const rcloneRemoteDoctor = (
  config: Pick<ServiceConfig, "rcloneExecutable" | "rcloneRemote" | "rcloneBackupRoot" | "rcloneTimeoutMs">,
  commandRunner: RcloneCommandRunner = rcloneCommandRunnerProduction,
): Promise<Result<RcloneDoctorResult>> => rcloneRemoteDoctorRun(config, commandRunner)

async function rcloneRemoteDoctorRun(
  config: Pick<ServiceConfig, "rcloneExecutable" | "rcloneRemote" | "rcloneBackupRoot" | "rcloneTimeoutMs">,
  commandRunner: RcloneCommandRunner,
): Promise<Result<RcloneDoctorResult>> {
  const op = "rcloneRemoteDoctor"
  if (config.rcloneRemote !== "gdrive_beta")
    return rcloneErrorCreate(op, "invalid_remote", "rclone remote must be gdrive_beta")
  if (config.rcloneBackupRoot !== "backups")
    return rcloneErrorCreate(op, "invalid_remote", "rclone backup root must be backups")

  const version = await commandRunner({
    executable: config.rcloneExecutable,
    args: ["version"],
    timeoutMs: config.rcloneTimeoutMs,
  })
  if (!version.success) return version
  if (version.data.exitCode !== 0) return rcloneErrorCreate(op, "command_unavailable", "rclone version check failed")

  const remotes = await commandRunner({
    executable: config.rcloneExecutable,
    args: ["listremotes"],
    timeoutMs: config.rcloneTimeoutMs,
  })
  if (!remotes.success) return remotes
  if (remotes.data.exitCode !== 0 || !remotes.data.stdout.split(/\r?\n/u).includes("gdrive_beta:")) {
    return rcloneErrorCreate(op, "credential_missing", "configured rclone remote gdrive_beta was not found")
  }

  const probe = await commandRunner({
    executable: config.rcloneExecutable,
    args: ["lsd", "gdrive_beta:backups"],
    timeoutMs: config.rcloneTimeoutMs,
  })
  if (!probe.success) return probe
  if (probe.data.exitCode !== 0)
    return rcloneErrorCreate(op, "remote_unavailable", "gdrive_beta backup root is not accessible")

  const result = v.safeParse(rcloneDoctorResultSchema, {
    executable: "ok",
    remote: "gdrive_beta",
    credentials: "ok",
    backupRoot: "ok",
  })
  if (!result.success) return rcloneErrorCreate(op, "remote_unavailable", v.summarize(result.issues))
  return { success: true, data: result.output }
}
