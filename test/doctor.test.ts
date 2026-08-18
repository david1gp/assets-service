import { expect, test } from "bun:test"

import { doctorReportStringify } from "../src/doctor/doctorReportStringify.js"
import { doctorRunnerCreate } from "../src/doctor/doctorRunnerCreate.js"
import { doctorRunnerRun } from "../src/doctor/doctorRunnerRun.js"
import { resultErrorCreate } from "../src/schemas/resultErrorCreate.js"
import { r2DoctorCheckCreate } from "../src/infrastructure/storage/r2DoctorCheckCreate.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"

test("doctor runner only wires available checks in stable order", async () => {
  const runner = doctorRunnerCreate({
    runtime: () => ({ success: true, data: { details: { version: "1" } } }),
    r2: () => ({ success: true, data: { message: "reachable" } }),
    sqlite: () => ({ success: true, data: {} }),
  })
  const report = await runner.run()

  expect(report).toEqual({
    status: "pass",
    checks: [
      { name: "r2", status: "pass", message: "reachable" },
      { name: "sqlite", status: "pass", message: "ok" },
      { name: "runtime", status: "pass", message: "ok", details: { version: "1" } },
    ],
  })
})

test("doctor report is deterministic and redacts credential-shaped data", async () => {
  const report = await doctorRunnerRun({
    rclone: () =>
      resultErrorCreate("rclone", "remote failed: token=top-secret", {
        remote: "gdrive_beta",
        R2_SECRET_ACCESS_KEY: "another-secret",
        authorization: "Bearer bearer-secret",
      }),
    runtime: () => ({
      success: true,
      data: { details: { endpoint: "https://user:password@example.test/path?token=url-secret" } },
    }),
  })

  expect(doctorReportStringify(report)).toBe(
    '{"checks":[{"details":{"R2_SECRET_ACCESS_KEY":"[REDACTED]","authorization":"[REDACTED]","remote":"gdrive_beta"},"message":"remote failed: token=[REDACTED]","name":"rclone","status":"fail"},{"details":{"endpoint":"https://[REDACTED]@example.test/path?token=[REDACTED]"},"message":"ok","name":"runtime","status":"pass"}],"status":"fail"}\n',
  )
  expect(doctorReportStringify(report)).toBe(doctorReportStringify(report))
  expect(doctorReportStringify(report)).not.toContain("top-secret")
  expect(doctorReportStringify(report)).not.toContain("another-secret")
  expect(doctorReportStringify(report)).not.toContain("bearer-secret")
  expect(doctorReportStringify(report)).not.toContain("url-secret")
})

test("the R2 doctor combines bucket access and public-domain checks", async () => {
  const config = {
    environment: "development" as const,
    apiHost: "https://api.example.test",
    apiPort: 8787,
    databasePath: "/tmp/assets-service-doctor.sqlite",
    r2AccountId: "account",
    r2AccessKeyId: "access",
    r2SecretAccessKey: "secret",
    r2Bucket: "assets-development",
    r2Endpoint: "https://account.r2.cloudflarestorage.com",
    r2PublicBaseUrl: "https://assets.example.test",
    workerId: "worker-1",
    rcloneExecutable: "rclone",
    rcloneRemote: "gdrive_beta" as const,
    rcloneBackupRoot: "backups" as const,
    rcloneTimeoutMs: 1000,
    ffprobeExecutable: "ffprobe",
  }
  const check = r2DoctorCheckCreate({
    config,
    adapter: memoryStorageAdapterCreate(),
    customDomainFetch: async () => new Response(null, { status: 200 }),
  })
  expect(await check()).toMatchObject({
    success: true,
    data: { message: "R2 credentials and public domain are reachable" },
  })
})
