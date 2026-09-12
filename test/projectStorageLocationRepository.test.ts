import { expect, test } from "bun:test"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { projectStorageLocationRepositoryCreate } from "../src/project/projectStorageLocationRepositoryCreate.js"

test("project storage location repository normalizes prefixes and deduplicates locations", () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return
  try {
    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    for (const result of [
      databaseRecordInsert(opened.data.db, organizationTable, {
        id: "org-storage-location",
        name: "Storage location",
        slug: "storage-location",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      }),
      databaseRecordInsert(opened.data.db, projectTable, {
        id: "project-storage-location",
        organizationId: "org-storage-location",
        name: "Storage location",
        slug: "storage-location",
        defaultEnvironment: "development",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      }),
    ]) {
      if (!result.success) throw new Error(result.errorMessage)
    }

    const repository = projectStorageLocationRepositoryCreate(opened.data.db, {
      clock: () => new Date("2026-09-01T00:00:00.000Z"),
    })
    expect(
      repository.projectStorageLocationCreate({
        projectId: "project-storage-location",
        environment: "development",
        bucket: "assets",
        prefix: "/",
      }),
    ).toMatchObject({ success: true, data: { prefix: "" } })
    expect(
      repository.projectStorageLocationCreate({
        projectId: "project-storage-location",
        environment: "development",
        bucket: "assets",
        prefix: "",
      }),
    ).toMatchObject({ success: true, data: { createdAt: "2026-09-01T00:00:00.000Z", prefix: "" } })
    expect(
      repository.projectStorageLocationCreate({
        projectId: "project-storage-location",
        environment: "production",
        bucket: "assets",
        prefix: "",
      }),
    ).toMatchObject({ success: true })

    const locations = repository.projectStorageLocationsRead("project-storage-location")
    expect(locations).toMatchObject({ success: true })
    if (locations.success)
      expect(locations.data.map(({ environment, bucket, prefix }) => ({ environment, bucket, prefix }))).toEqual([
        { environment: "development", bucket: "assets", prefix: "" },
        { environment: "production", bucket: "assets", prefix: "" },
      ])
    expect(repository.projectStorageLocationsAllRead()).toMatchObject({
      success: true,
      data: locations.success ? locations.data : [],
    })
  } finally {
    databaseClose(opened.data)
  }
})
