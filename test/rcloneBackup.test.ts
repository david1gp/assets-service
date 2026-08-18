import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { rm } from "node:fs/promises"

import { backupOriginal } from "../src/backup/backupOriginal.js"
import { rcloneBackupAdapterFake } from "../src/backup/rcloneBackupAdapterFake.js"
import { rcloneErrorCreate } from "../src/backup/rcloneErrorCreate.js"
import { rcloneBackupAdapterProduction } from "../src/infrastructure/rclone/rcloneBackupAdapterProduction.js"
import type { RcloneCommandRunner } from "../src/infrastructure/rclone/rcloneCommandRunner.js"
import { rcloneCommandRunnerProduction } from "../src/infrastructure/rclone/rcloneCommandRunnerProduction.js"

const requestCreate = (localSourcePath: string, bytes: Uint8Array) => ({
  localSourcePath,
  projectId: "project-1",
  sourceRevisionId: "revision-1",
  jobId: "job-1",
  organizationName: "adaptive",
  projectName: "website",
  logicalFolders: ["home"],
  originalFilename: "hero.png",
  expectedByteSize: bytes.byteLength,
  expectedSha256: createHash("sha256").update(bytes).digest("hex"),
})

test("rclone production adapter uses copyto and verifies size and checksum", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4])
  const filePath = `${import.meta.dir}/rclone-source.bin`
  const file = Bun.file(filePath)
  await Bun.write(file, bytes)
  const commands: string[][] = []
  const runner: RcloneCommandRunner = async (input) => {
    commands.push(input.args)
    if (input.args[0] === "size") return { success: true, data: { exitCode: 0, stdout: '{"bytes":4}', stderr: "" } }
    return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
  }

  try {
    const adapter = rcloneBackupAdapterProduction(
      { rcloneExecutable: "rclone", rcloneRemote: "gdrive_beta", rcloneBackupRoot: "backups", rcloneTimeoutMs: 1000 },
      runner,
    )
    const result = await adapter(requestCreate(filePath, bytes))
    expect(result.success).toBe(true)
    expect(commands.map((command) => command[0])).toEqual(["copyto", "size", "check"])
    expect(commands[0]).toContain("--immutable")
    expect(commands.flat()).not.toContain("sync")
    expect(commands.flat()).not.toContain("bisync")
    if (result.success) {
      expect(result.data.remotePath).toBe("gdrive_beta:backups/adaptive/assets/website/home/revision-1/hero.png")
      expect(result.data.checkResult).toBe("verified")
    }
  } finally {
    await rm(filePath, { force: true })
  }
})

test("backupOriginal creates a verified receipt and reuses an existing one", async () => {
  const bytes = new Uint8Array([7, 8])
  const adapter = rcloneBackupAdapterFake({ completedAt: "2026-08-17T10:00:00.000Z" })
  const request = requestCreate("/tmp/source.png", bytes)
  const first = await backupOriginal(request, adapter, { receiptId: "receipt-1" })
  expect(first.success).toBe(true)
  if (!first.success) return
  expect(first.data).toMatchObject({
    id: "receipt-1",
    sourceRevisionId: "revision-1",
    remotePath: "gdrive_beta:backups/adaptive/assets/website/home/revision-1/hero.png",
    byteSize: 2,
    sha256: request.expectedSha256,
    checkResult: "verified",
  })

  const second = await backupOriginal(
    request,
    async () => rcloneErrorCreate("unexpected", "copy_failed", "should not run"),
    {
      existingReceipt: first.data,
    },
  )
  expect(second).toEqual(first)
  expect(adapter.invocations).toHaveLength(1)
})

test("fake adapter returns structured cancellation and verification failures", async () => {
  const request = requestCreate("/tmp/source.png", new Uint8Array([1]))
  const cancelled = await rcloneBackupAdapterFake({ failure: "cancelled" })(request)
  const failed = await rcloneBackupAdapterFake({ failure: "verification_failed" })(request)
  expect(cancelled).toMatchObject({ success: false, rawData: { code: "cancelled" } })
  expect(failed).toMatchObject({ success: false, rawData: { code: "verification_failed" } })
})

test("production command runner returns timeout and cancellation errors without command output", async () => {
  const forbidden = await rcloneCommandRunnerProduction({ executable: "rclone", args: ["sync"], timeoutMs: 1000 })
  expect(forbidden).toMatchObject({ success: false, rawData: { code: "invalid_request" } })

  const timeout = await rcloneCommandRunnerProduction({
    executable: process.execPath,
    args: ["-e", "await Bun.sleep(1000)"],
    timeoutMs: 20,
  })
  expect(timeout).toMatchObject({ success: false, rawData: { code: "timeout" } })

  const controller = new AbortController()
  const cancellation = rcloneCommandRunnerProduction({
    executable: process.execPath,
    args: ["-e", "await Bun.sleep(1000)"],
    timeoutMs: 1000,
    signal: controller.signal,
  })
  controller.abort()
  expect(await cancellation).toMatchObject({ success: false, rawData: { code: "cancelled" } })
})

test("production command runner preserves stderr for a failed copy-only command", async () => {
  const result = await rcloneCommandRunnerProduction({
    executable: process.execPath,
    args: ["-e", 'console.error("copy failed") ; process.exit(2)'],
    timeoutMs: 1000,
  })
  expect(result).toMatchObject({ success: true, data: { exitCode: 2, stderr: "copy failed\n" } })
})
