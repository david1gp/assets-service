import { expect, test } from "bun:test"

import { backupMigrationCliOptionsRead } from "../src/migration/backupMigrationCliOptionsRead.js"

test("rejects conflicting dry-run and execute flags in either order", () => {
  for (const args of [
    ["--dry-run", "--execute"],
    ["--execute", "--dry-run"],
  ]) {
    const result = backupMigrationCliOptionsRead(args)
    expect(result.success).toBe(false)
    if (result.success) continue
    expect(result.errorMessage).toContain("cannot be combined")
  }
})

test("accepts resume flags in either order when execution is explicit", () => {
  expect(backupMigrationCliOptionsRead(["--execute", "--resume", "run-1"])).toEqual({
    success: true,
    data: { execute: true, runId: "run-1" },
  })
  expect(backupMigrationCliOptionsRead(["--resume", "run-1", "--execute"])).toEqual({
    success: true,
    data: { execute: true, runId: "run-1" },
  })
})
