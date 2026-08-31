import { describe, expect, test } from "bun:test"

import { auditApiRepositoryCreate } from "../src/audit/auditApiRepositoryCreate.js"
import { auditEventRepositoryAppend } from "../src/audit/auditEventRepositoryAppend.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"

const now = "2026-08-17T00:00:00.000Z"

const databaseCreate = () => {
  const opened = databaseOpen(":memory:")
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  const organization = databaseRecordInsert(opened.data.db, organizationTable, {
    id: "org-1",
    name: "Example",
    slug: "example",
    createdAt: now,
    updatedAt: now,
  })
  if (!organization.success) throw new Error(organization.errorMessage)
  const project = databaseRecordInsert(opened.data.db, projectTable, {
    id: "project-1",
    organizationId: "org-1",
    name: "Example",
    slug: "example",
    defaultEnvironment: "development",
    createdAt: now,
    updatedAt: now,
  })
  if (!project.success) throw new Error(project.errorMessage)
  return opened.data
}

const eventsAppend = (db: ReturnType<typeof databaseCreate>["db"]) => {
  for (const [id, action, createdAt] of [
    ["audit-created", "asset.created", "2026-08-17T00:00:03.000Z"],
    ["audit-deleted", "asset.deleted", "2026-08-17T00:00:02.000Z"],
    ["audit-requested", "asset.deletion_requested", "2026-08-17T00:00:01.000Z"],
  ] as const) {
    const appended = auditEventRepositoryAppend(db, {
      id,
      organizationId: "org-1",
      projectId: "project-1",
      actorId: "actor-1",
      action,
      resourceType: "asset",
      resourceId: "asset-1",
      details: {},
      createdAt,
    })
    if (!appended.success) throw new Error(appended.errorMessage)
  }
}

describe("audit API persistence", () => {
  test("returns every action when the action filter is absent", () => {
    const connection = databaseCreate()
    try {
      eventsAppend(connection.db)
      const result = auditApiRepositoryCreate(connection.db).auditEventsRead("project-1", {})

      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data.items.map((item) => item.action)).toEqual([
          "asset.created",
          "asset.deleted",
          "asset.deletion_requested",
        ])
    } finally {
      databaseClose(connection)
    }
  })

  test("matches one exact action", () => {
    const connection = databaseCreate()
    try {
      eventsAppend(connection.db)
      const result = auditApiRepositoryCreate(connection.db).auditEventsRead("project-1", { action: "asset.created" })

      expect(result).toMatchObject({ success: true, data: { items: [{ action: "asset.created" }] } })
    } finally {
      databaseClose(connection)
    }
  })

  test("matches multiple actions with OR semantics and preserves pagination", () => {
    const connection = databaseCreate()
    try {
      eventsAppend(connection.db)
      const repository = auditApiRepositoryCreate(connection.db)
      const first = repository.auditEventsRead("project-1", { action: "asset.created,asset.deleted", limit: 1 })
      const second = repository.auditEventsRead("project-1", {
        action: "asset.created,asset.deleted",
        cursor: 1,
        limit: 1,
      })

      expect(first).toMatchObject({ success: true, data: { items: [{ action: "asset.created" }], nextCursor: 1 } })
      expect(second).toMatchObject({ success: true, data: { items: [{ action: "asset.deleted" }], nextCursor: null } })
    } finally {
      databaseClose(connection)
    }
  })
})
