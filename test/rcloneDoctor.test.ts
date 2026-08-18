import { expect, test } from "bun:test"

import { rcloneRemoteDoctor } from "../src/backup/rcloneRemoteDoctor.js"
import type { RcloneCommandRunner } from "../src/infrastructure/rclone/rcloneCommandRunner.js"

const config = {
  rcloneExecutable: "rclone",
  rcloneRemote: "gdrive_beta" as const,
  rcloneBackupRoot: "backups" as const,
  rcloneTimeoutMs: 1000,
}

test("rclone doctor checks executable, exact remote, credentials, and backup root", async () => {
  const commands: string[][] = []
  const runner: RcloneCommandRunner = async (input) => {
    commands.push(input.args)
    if (input.args[0] === "listremotes")
      return { success: true, data: { exitCode: 0, stdout: "gdrive_beta:\n", stderr: "" } }
    return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
  }
  const result = await rcloneRemoteDoctor(config, runner)
  expect(result.success).toBe(true)
  expect(commands.map((command) => command[0])).toEqual(["version", "listremotes", "lsd"])
})

test("rclone doctor reports a missing exact remote without exposing command output", async () => {
  const runner: RcloneCommandRunner = async (input) =>
    input.args[0] === "listremotes"
      ? { success: true, data: { exitCode: 0, stdout: "other:\n", stderr: "secret-token" } }
      : { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
  const result = await rcloneRemoteDoctor(config, runner)
  expect(result).toMatchObject({ success: false, rawData: { code: "credential_missing" } })
  if (!result.success) expect(result.errorMessage).not.toContain("secret-token")
})

test("rclone doctor rejects an alternate configured remote", async () => {
  const result = await rcloneRemoteDoctor({ ...config, rcloneRemote: "beta_gdrive" as never }, async () => {
    throw new Error("runner must not run")
  })
  expect(result).toMatchObject({ success: false, rawData: { code: "invalid_remote" } })
})
