import { expect, test } from "bun:test"

import { rcloneBackupRemotePathMigrationAdapterProduction } from "../src/migration/rcloneBackupRemotePathMigrationAdapterProduction.js"

const config = {
  rcloneExecutable: "rclone",
  rcloneRemote: "gdrive_beta" as const,
  rcloneBackupRoot: "backups" as const,
  rcloneTimeoutMs: 1_000,
}

test("classifies documented rclone missing-object exit codes without parsing stderr", async () => {
  for (const exitCode of [3, 4]) {
    const adapter = rcloneBackupRemotePathMigrationAdapterProduction(config, async () => ({
      success: true,
      data: { exitCode, stdout: "", stderr: "backend returned an arbitrary message" },
    }))
    const result = await adapter.remoteObjectVerify({
      remotePath: "gdrive_beta:backups/object",
      expectedByteSize: 1,
      expectedSha256: "sha256",
    })
    expect(result).toEqual({ success: true, data: "missing" })
  }

  const adapter = rcloneBackupRemotePathMigrationAdapterProduction(config, async () => ({
    success: true,
    data: { exitCode: 1, stdout: "", stderr: "not found" },
  }))
  const result = await adapter.remoteObjectVerify({
    remotePath: "gdrive_beta:backups/object",
    expectedByteSize: 1,
    expectedSha256: "sha256",
  })
  expect(result.success).toBe(false)
})
