import { expect, test } from "bun:test"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { projectStorageDomainRepositoryCreate } from "../src/project/projectStorageDomainRepositoryCreate.js"

test("project storage domain repository preserves bucket restoration metadata idempotently", () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return
  try {
    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    for (const result of [
      databaseRecordInsert(opened.data.db, organizationTable, {
        id: "org-storage-domain",
        name: "Storage domain",
        slug: "storage-domain",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      }),
      databaseRecordInsert(opened.data.db, projectTable, {
        id: "project-storage-domain",
        organizationId: "org-storage-domain",
        name: "Storage domain",
        slug: "storage-domain",
        defaultEnvironment: "production",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      }),
    ]) {
      if (!result.success) throw new Error(result.errorMessage)
    }

    const repository = projectStorageDomainRepositoryCreate(opened.data.db, {
      clock: () => new Date("2026-09-02T00:00:00.000Z"),
    })
    const created = repository.projectStorageDomainCreate({
      projectId: "project-storage-domain",
      bucket: "assets",
      customDomain: "assets.example.test",
      zoneId: "zone-1",
    })
    expect(created).toMatchObject({ success: true, data: { customDomain: "assets.example.test", zoneId: "zone-1" } })

    const repeated = repository.projectStorageDomainCreate({
      projectId: "project-storage-domain",
      bucket: "assets",
      customDomain: "assets.example.test",
      zoneId: "zone-2",
    })
    expect(repeated).toMatchObject({
      success: true,
      data: {
        id: created.success ? created.data.id : "",
        zoneId: "zone-2",
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
      },
    })
    expect(repository.projectStorageDomainsRead("project-storage-domain")).toMatchObject({
      success: true,
      data: [repeated.success ? repeated.data : null],
    })
    expect(repository.projectStorageDomainsForBucketRead("assets")).toMatchObject({ success: true })
    expect(
      repository.projectStorageDomainCreate({
        projectId: "project-storage-domain",
        bucket: "assets",
        customDomain: "HTTPS://assets.example.test",
        zoneId: "zone-3",
      }).success,
    ).toBe(false)
  } finally {
    databaseClose(opened.data)
  }
})
