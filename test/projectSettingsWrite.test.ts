import { mkdir, rm } from "node:fs/promises"

import { describe, expect, test } from "bun:test"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { projectRepositoryCreate } from "../src/project/projectRepositoryCreate.js"

const databasePathCreate = () => `data/project-settings-${crypto.randomUUID()}.sqlite`

const update = {
  name: "Renamed project",
  defaultEnvironment: "production" as const,
  binding: { zitadelProjectId: "zitadel-9", serviceProjectId: "renamed-service" },
  environments: [
    {
      name: "development" as const,
      r2Bucket: "assets-development",
      r2Prefix: "renamed-service",
      publicBaseUrl: "https://dev.example.test",
    },
    {
      name: "production" as const,
      r2Bucket: "assets-production",
      r2Prefix: "renamed-service",
      publicBaseUrl: "https://example.test",
    },
  ],
}

const repositoryCreate = async (databasePath: string) => {
  await mkdir("data", { recursive: true })
  const opened = databaseOpen(databasePath)
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  databaseRecordInsert(opened.data.db, organizationTable, {
    id: "org-1",
    name: "Example",
    slug: "example",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  })
  databaseRecordInsert(opened.data.db, projectTable, {
    id: "project-1",
    organizationId: "org-1",
    name: "Example project",
    slug: "example-project",
    defaultEnvironment: "development",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  })
  databaseRecordInsert(opened.data.db, environmentTable, {
    id: "environment-1",
    projectId: "project-1",
    name: "development",
    r2Bucket: "old-bucket",
    r2Prefix: "old-prefix",
    publicBaseUrl: "https://old.example.test",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  })
  return { connection: opened.data, repository: projectRepositoryCreate(opened.data.db) }
}

describe("projectRepository.projectSettingsWrite", () => {
  test("creates the binding, updates one environment, and inserts the missing one", async () => {
    const databasePath = databasePathCreate()
    const { connection, repository } = await repositoryCreate(databasePath)
    try {
      const written = repository.projectSettingsWrite("project-1", update)
      expect(written.success).toBe(true)
      if (!written.success || !written.data) return

      expect(written.data.project.name).toBe("Renamed project")
      expect(written.data.project.defaultEnvironment).toBe("production")
      expect(written.data.binding?.serviceProjectId).toBe("renamed-service")
      expect(written.data.environments.map((environment) => environment.name).sort()).toEqual([
        "development",
        "production",
      ])
      const development = written.data.environments.find((environment) => environment.name === "development")
      expect(development?.r2Bucket).toBe("assets-development")
    } finally {
      databaseClose(connection)
      await rm(databasePath, { force: true })
      await rm(`${databasePath}-wal`, { force: true })
      await rm(`${databasePath}-shm`, { force: true })
    }
  })

  test("rejects a default environment that is not configured and leaves the project untouched", async () => {
    const databasePath = databasePathCreate()
    const { connection, repository } = await repositoryCreate(databasePath)
    try {
      const written = repository.projectSettingsWrite("project-1", {
        ...update,
        environments: [update.environments[0] as (typeof update.environments)[number]],
      })
      expect(written.success).toBe(false)

      const settings = repository.projectSettingsRead("project-1")
      expect(settings.success && settings.data?.project.name).toBe("Example project")
    } finally {
      databaseClose(connection)
      await rm(databasePath, { force: true })
      await rm(`${databasePath}-wal`, { force: true })
      await rm(`${databasePath}-shm`, { force: true })
    }
  })

  test("returns null for an unknown project", async () => {
    const databasePath = databasePathCreate()
    const { connection, repository } = await repositoryCreate(databasePath)
    try {
      expect(repository.projectSettingsWrite("missing", update)).toEqual({ success: true, data: null })
    } finally {
      databaseClose(connection)
      await rm(databasePath, { force: true })
      await rm(`${databasePath}-wal`, { force: true })
      await rm(`${databasePath}-shm`, { force: true })
    }
  })
})
