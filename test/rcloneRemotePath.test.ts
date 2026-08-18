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

test("rclone path is pinned to gdrive_beta and has the append-only hierarchy", () => {
  expect(rcloneRemotePathCreate(input())).toEqual({
    success: true,
    data: "gdrive_beta:backups/adaptive/assets/website/home/hero/revision-1/hero.png",
  })
  expect(rcloneRemotePathCreate(input({ remote: "beta_gdrive" })).success).toBe(false)
})

test("rclone path rejects traversal and alternate remote separators", () => {
  expect(rcloneRemotePathCreate(input({ logicalFolders: ["../private"] })).success).toBe(false)
  expect(rcloneRemotePathCreate(input({ originalFilename: "nested/file.png" })).success).toBe(false)
  expect(rcloneRemotePathCreate(input({ organizationName: "other:remote" })).success).toBe(false)
})
