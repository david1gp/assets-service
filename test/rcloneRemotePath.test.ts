import { expect, test } from "bun:test"

import { rcloneRemotePathCreate } from "../src/backup/rcloneRemotePathCreate.js"

const input = (overrides: Record<string, unknown> = {}) => ({
  remote: "gdrive_beta",
  backupRoot: "backups",
  organizationName: "adaptive",
  projectName: "website",
  logicalFolders: ["home", "hero"],
  sourceRevisionId: "revision-1",
  originalFilename: "hero.png",
  ...overrides,
})

const backupDate = new Date("2026-08-19T12:34:56.000Z")

test("rclone path is pinned to gdrive_beta and has a dated append-only hierarchy", () => {
  expect(rcloneRemotePathCreate(input(), backupDate)).toEqual({
    success: true,
    data: "gdrive_beta:backups/20260819T123456000Z/adaptive/assets/website/home/hero/revision-1/hero.png",
  })
  expect(rcloneRemotePathCreate(input({ remote: "beta_gdrive" }), backupDate).success).toBe(false)
})

test("rclone path rejects traversal and alternate remote separators", () => {
  expect(rcloneRemotePathCreate(input({ logicalFolders: ["../private"] }), backupDate).success).toBe(false)
  expect(rcloneRemotePathCreate(input({ originalFilename: "nested/file.png" }), backupDate).success).toBe(false)
  expect(rcloneRemotePathCreate(input({ organizationName: "other:remote" }), backupDate).success).toBe(false)
})
