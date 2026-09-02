import { expect, test } from "bun:test"
import * as v from "valibot"

import { workflowListQuerySchema } from "../src/api-client/workflowListQuerySchema.js"
import { storageMigrationProgressSchema } from "../src/migration/storageMigrationProgressSchema.js"
import { workflowSchema } from "../src/workflow/workflowSchema.js"

const timestamps = {
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
}

test("accepts storage migration workflows with a nullable asset id and legacy asset workflows", () => {
  expect(
    v.safeParse(workflowSchema, {
      id: "workflow-storage-migration",
      projectId: "project-1",
      assetId: null,
      kind: "storage_migration",
      status: "queued",
      ...timestamps,
    }).success,
  ).toBe(true)
  expect(
    v.safeParse(workflowSchema, {
      id: "workflow-legacy-asset",
      projectId: "project-1",
      assetId: "asset-1",
      kind: "asset_processing",
      status: "succeeded",
      ...timestamps,
    }).success,
  ).toBe(true)
})

test("shares storage migration kind validation with workflow API filters", () => {
  expect(v.safeParse(workflowListQuerySchema, { kind: "storage_migration" }).success).toBe(true)
  expect(v.safeParse(workflowListQuerySchema, { kind: "legacy_import" }).success).toBe(false)
})

test("rejects inconsistent storage migration progress counters at the schema boundary", () => {
  expect(
    v.safeParse(storageMigrationProgressSchema, {
      phase: "copying",
      totalObjects: 1,
      discoveredObjects: 2,
      copiedObjects: 0,
      verifiedObjects: 0,
      totalBytes: 1,
      copiedBytes: 0,
      currentObjectKey: null,
    }).success,
  ).toBe(false)
})
