import { describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import type { InferInsertModel } from "drizzle-orm"
import { eq } from "drizzle-orm"
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core"

import type { AssetDatabase } from "../src/infrastructure/db/assetDatabase.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../src/infrastructure/db/schema/outputVersionTable.js"
import { projectBindingTable } from "../src/infrastructure/db/schema/projectBindingTable.js"
import { projectGrantTable } from "../src/infrastructure/db/schema/projectGrantTable.js"
import { projectStorageLocationTable } from "../src/infrastructure/db/schema/projectStorageLocationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { projectRepositoryCreate } from "../src/project/projectRepositoryCreate.js"

const timestamp = "2026-08-17T00:00:00.000Z"
const project = {
  id: "project-1",
  organizationId: "org-1",
  name: "Example project",
  slug: "example-project",
  defaultEnvironment: "development" as const,
  archiveState: "active" as const,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const projectCreateInput = {
  organization: { id: "org-new", name: "New organization", slug: "new-organization" },
  name: "Registered project",
  slug: "registered-project",
  defaultEnvironment: "development" as const,
  binding: { zitadelProjectId: "zitadel-registered", serviceProjectId: "service-registered" },
  environments: [
    {
      name: "development" as const,
      r2Bucket: "assets-development",
      r2Prefix: "registered/development",
      publicBaseUrl: "https://development.assets.example.test",
    },
    {
      name: "production" as const,
      r2Bucket: "assets-production",
      r2Prefix: "registered/production",
      publicBaseUrl: "https://assets.example.test",
    },
  ],
}

const databasePathCreate = () => `data/project-repository-${crypto.randomUUID()}.sqlite`

const recordInsertRequired = <TTable extends AnySQLiteTable>(
  db: AssetDatabase,
  table: TTable,
  values: InferInsertModel<TTable>,
) => {
  const inserted = databaseRecordInsert(db, table, values)
  if (!inserted.success) throw new Error(inserted.errorMessage)
}

const repositoryCreate = async () => {
  await mkdir("data", { recursive: true })
  const databasePath = databasePathCreate()
  const opened = databaseOpen(databasePath)
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)

  recordInsertRequired(opened.data.db, organizationTable, {
    id: "org-1",
    name: "Example",
    slug: "example",
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  recordInsertRequired(opened.data.db, projectTable, project)
  recordInsertRequired(opened.data.db, projectBindingTable, {
    id: "binding-1",
    projectId: "project-1",
    organizationId: "org-1",
    zitadelProjectId: "zitadel-1",
    serviceProjectId: "service-project-1",
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  return { databasePath, connection: opened.data, repository: projectRepositoryCreate(opened.data.db) }
}

const emptyRepositoryCreate = async () => {
  await mkdir("data", { recursive: true })
  const databasePath = databasePathCreate()
  const opened = databaseOpen(databasePath)
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  return { databasePath, connection: opened.data, repository: projectRepositoryCreate(opened.data.db) }
}

const cleanup = async (
  databasePath: string,
  connection: Awaited<ReturnType<typeof repositoryCreate>>["connection"],
) => {
  databaseClose(connection)
  await rm(databasePath, { force: true })
  await rm(`${databasePath}-wal`, { force: true })
  await rm(`${databasePath}-shm`, { force: true })
}

describe("projectRepository slug reads", () => {
  test("resolves organizations globally and projects within the resolved organization", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      recordInsertRequired(connection.db, organizationTable, {
        id: "org-2",
        name: "Other",
        slug: "other",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      recordInsertRequired(connection.db, projectTable, { ...project, id: "project-2", organizationId: "org-2" })

      const organization = repository.organizationReadBySlug("example")
      expect(organization).toMatchObject({ success: true, data: { id: "org-1", slug: "example" } })
      expect(repository.organizationReadBySlug("missing")).toEqual({ success: true, data: null })

      const firstProject = repository.projectReadByOrganizationIdAndSlug("org-1", "example-project")
      expect(firstProject).toMatchObject({
        success: true,
        data: { id: "project-1", organizationId: "org-1", slug: "example-project" },
      })
      const secondProject = repository.projectReadByOrganizationIdAndSlug("org-2", "example-project")
      expect(secondProject).toMatchObject({
        success: true,
        data: { id: "project-2", organizationId: "org-2", slug: "example-project" },
      })
      expect(repository.projectReadByOrganizationIdAndSlug("org-1", "missing")).toEqual({
        success: true,
        data: null,
      })
    } finally {
      await cleanup(databasePath, connection)
    }
  })
})

describe("projectRepository.projectsRead", () => {
  test("returns zero metrics for a project without assets", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      const listed = repository.projectsRead("org-1", ["zitadel-1"])
      expect(listed.success).toBe(true)
      if (!listed.success) return
      expect(listed.data).toEqual([{ ...project, organizationSlug: "example", assetCount: 0, totalFileSize: 0 }])
    } finally {
      await cleanup(databasePath, connection)
    }
  })

  test("counts multiple assets and sums only their current source revisions", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      const assetsAndSources = databaseTransactionRun(connection.db, (transaction) => {
        recordInsertRequired(transaction, assetTable, {
          id: "asset-1",
          projectId: "project-1",
          class: "image",
          folder1: "home",
          folder2: null,
          folder3: null,
          filename: "hero.jpg",
          basename: "hero",
          currentSourceRevisionId: "source-1-v2",
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        recordInsertRequired(transaction, assetTable, {
          id: "asset-2",
          projectId: "project-1",
          class: "font",
          folder1: null,
          folder2: null,
          folder3: null,
          filename: "brand.woff2",
          basename: "brand",
          currentSourceRevisionId: "source-2-v2",
          createdAt: timestamp,
          updatedAt: timestamp,
        })

        recordInsertRequired(transaction, sourceRevisionTable, {
          id: "source-1-v1",
          assetId: "asset-1",
          revision: 1,
          class: "image",
          originalFilename: "hero.jpg",
          mediaType: "image/jpeg",
          byteSize: 10,
          sha256: "a".repeat(64),
          objectKey: "sources/asset-1/v1/hero.jpg",
          createdAt: timestamp,
        })
        recordInsertRequired(transaction, sourceRevisionTable, {
          id: "source-1-v2",
          assetId: "asset-1",
          revision: 2,
          class: "image",
          originalFilename: "hero.jpg",
          mediaType: "image/jpeg",
          byteSize: 20,
          sha256: "b".repeat(64),
          objectKey: "sources/asset-1/v2/hero.jpg",
          createdAt: timestamp,
        })
        recordInsertRequired(transaction, sourceRevisionTable, {
          id: "source-2-v1",
          assetId: "asset-2",
          revision: 1,
          class: "font",
          originalFilename: "brand.woff2",
          mediaType: "font/woff2",
          byteSize: 40,
          sha256: "c".repeat(64),
          objectKey: "sources/asset-2/v1/brand.woff2",
          createdAt: timestamp,
        })
        recordInsertRequired(transaction, sourceRevisionTable, {
          id: "source-2-v2",
          assetId: "asset-2",
          revision: 2,
          class: "font",
          originalFilename: "brand.woff2",
          mediaType: "font/woff2",
          byteSize: 30,
          sha256: "d".repeat(64),
          objectKey: "sources/asset-2/v2/brand.woff2",
          createdAt: timestamp,
        })
        return { success: true, data: null } as const
      })
      if (!assetsAndSources.success) throw new Error(assetsAndSources.errorMessage)

      recordInsertRequired(connection.db, outputDefinitionTable, {
        id: "output-1",
        assetId: "asset-1",
        kind: "image",
        key: "small",
        width: 1,
        height: 1,
        format: "webp",
        quality: null,
        showAiLabel: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      recordInsertRequired(connection.db, outputVersionTable, {
        id: "output-version-1",
        projectId: "project-1",
        outputDefinitionId: "output-1",
        assetId: "asset-1",
        sourceRevisionId: "source-1-v2",
        version: 1,
        byteSize: 900,
        sha256: "e".repeat(64),
        mediaType: "image/webp",
        extension: "webp",
        objectKey: "outputs/asset-1/small.webp",
        toolchainVersion: "test",
        width: 1,
        height: 1,
        current: true,
        createdAt: timestamp,
      })

      const listed = repository.projectsRead("org-1", ["zitadel-1"])
      expect(listed.success).toBe(true)
      if (!listed.success) return
      expect(listed.data[0]).toMatchObject({ assetCount: 2, totalFileSize: 50 })
    } finally {
      await cleanup(databasePath, connection)
    }
  })

  test("filters project lists by organization-owned bindings and exact grants", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      recordInsertRequired(connection.db, organizationTable, {
        id: "org-2",
        name: "Other",
        slug: "other",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      recordInsertRequired(connection.db, projectTable, {
        ...project,
        id: "project-2",
        name: "Second project",
        slug: "second-project",
      })
      recordInsertRequired(connection.db, projectBindingTable, {
        id: "binding-2",
        projectId: "project-2",
        organizationId: "org-1",
        zitadelProjectId: "zitadel-2",
        serviceProjectId: "service-project-2",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      recordInsertRequired(connection.db, projectTable, {
        ...project,
        id: "project-3",
        name: "Other project",
        slug: "other-project",
      })
      recordInsertRequired(connection.db, projectBindingTable, {
        id: "binding-3",
        projectId: "project-3",
        organizationId: "org-2",
        zitadelProjectId: "zitadel-3",
        serviceProjectId: "service-project-3",
        createdAt: timestamp,
        updatedAt: timestamp,
      })

      const administrator = repository.projectsRead("org-1", [], true)
      const firstGrant = repository.projectsRead("org-1", ["zitadel-1"])
      const secondGrant = repository.projectsRead("org-1", ["zitadel-2"])
      const combinedGrants = repository.projectsRead("org-1", ["zitadel-1", "zitadel-2"])
      const foreignGrant = repository.projectsRead("org-1", ["zitadel-3"])
      expect(administrator.success && administrator.data.map((item) => item.id)).toEqual(["project-1", "project-2"])
      expect(firstGrant.success && firstGrant.data.map((item) => item.id)).toEqual(["project-1"])
      expect(secondGrant.success && secondGrant.data.map((item) => item.id)).toEqual(["project-2"])
      expect(combinedGrants.success && combinedGrants.data.map((item) => item.id)).toEqual(["project-1", "project-2"])
      expect(foreignGrant.success && foreignGrant.data).toEqual([])
    } finally {
      await cleanup(databasePath, connection)
    }
  })

  test("hides non-active projects by default and never lets a grant opt into them", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      for (const archiveState of ["archiving", "archived", "unarchiving"] as const) {
        recordInsertRequired(connection.db, projectTable, {
          ...project,
          id: `project-${archiveState}`,
          name: `${archiveState} project`,
          slug: `${archiveState}-project`,
          archiveState,
        })
        recordInsertRequired(connection.db, projectBindingTable, {
          id: `binding-${archiveState}`,
          projectId: `project-${archiveState}`,
          organizationId: "org-1",
          zitadelProjectId: `zitadel-${archiveState}`,
          serviceProjectId: `service-project-${archiveState}`,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      }

      const defaultAdministrator = repository.projectsRead("org-1", [], true)
      const administratorWithArchived = repository.projectsRead("org-1", [], true, true)
      const contributorWithArchived = repository.projectsRead("org-1", ["zitadel-archived"], false, true)

      expect(defaultAdministrator.success && defaultAdministrator.data.map((item) => item.id)).toEqual(["project-1"])
      expect(administratorWithArchived.success && administratorWithArchived.data.map((item) => item.id).sort()).toEqual(
        ["project-1", "project-archived", "project-archiving", "project-unarchiving"],
      )
      expect(contributorWithArchived.success && contributorWithArchived.data).toEqual([])
    } finally {
      await cleanup(databasePath, connection)
    }
  })
})

describe("projectRepository.projectArchiveStateWrite", () => {
  test("persists resumable archive and unarchive lifecycle transitions", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      const archiving = repository.projectArchiveStateWrite?.("project-1", "archiving")
      expect(archiving?.success && archiving.data?.archiveState).toBe("archiving")

      const archived = repository.projectArchiveStateWrite?.("project-1", "archived")
      expect(archived?.success && archived.data?.archiveState).toBe("archived")

      const hidden = repository.projectsRead("org-1", ["zitadel-1"])
      const visible = repository.projectsRead("org-1", [], true, true)
      expect(hidden.success && hidden.data).toEqual([])
      expect(visible.success && visible.data.map((item) => item.archiveState)).toEqual(["archived"])

      const unarchiving = repository.projectArchiveStateWrite?.("project-1", "unarchiving")
      const active = repository.projectArchiveStateWrite?.("project-1", "active")
      expect(unarchiving?.success && unarchiving.data?.archiveState).toBe("unarchiving")
      expect(active?.success && active.data?.archiveState).toBe("active")
    } finally {
      await cleanup(databasePath, connection)
    }
  })

  test("rejects lifecycle transitions that skip a storage phase", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      const written = repository.projectArchiveStateWrite?.("project-1", "archived")
      expect(written).toMatchObject({ success: false })
    } finally {
      await cleanup(databasePath, connection)
    }
  })

  test("rejects a lifecycle transition when the expected state changed", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      const written = repository.projectArchiveStateWrite?.("project-1", "archiving", "archived")
      expect(written).toMatchObject({
        success: false,
        errorMessage: "The project archive state transition was not allowed",
      })
      const current = repository.projectRead("project-1")
      expect(current.success && current.data?.archiveState).toBe("active")
    } finally {
      await cleanup(databasePath, connection)
    }
  })
})

describe("projectRepository.storageBindingsRead", () => {
  test("includes historical project storage locations when proving bucket ownership", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      recordInsertRequired(connection.db, projectStorageLocationTable, {
        id: "location-project-1-legacy",
        projectId: "project-1",
        environment: "production",
        bucket: "contentoren-assets-service-public",
        prefix: "template",
        createdAt: timestamp,
      })
      recordInsertRequired(connection.db, projectTable, {
        ...project,
        id: "project-2",
        slug: "second-project",
      })
      recordInsertRequired(connection.db, projectStorageLocationTable, {
        id: "location-project-2-legacy",
        projectId: "project-2",
        environment: "production",
        bucket: "contentoren-assets-service-public",
        prefix: "other-project",
        createdAt: timestamp,
      })

      const bindings = repository.storageBindingsRead?.()

      expect(bindings).toMatchObject({ success: true })
      if (bindings?.success)
        expect(bindings.data).toEqual([
          {
            projectId: "project-1",
            environment: "production",
            bucket: "contentoren-assets-service-public",
            prefix: "template",
            publicBaseUrl: "https://archive.invalid",
          },
          {
            projectId: "project-2",
            environment: "production",
            bucket: "contentoren-assets-service-public",
            prefix: "other-project",
            publicBaseUrl: "https://archive.invalid",
          },
        ])
    } finally {
      await cleanup(databasePath, connection)
    }
  })

  test("live storage bindings exclude archived project buckets while retaining active shared buckets", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      recordInsertRequired(connection.db, environmentTable, {
        id: "environment-project-1-production",
        projectId: "project-1",
        name: "production",
        r2Bucket: "active-current",
        r2Prefix: "current",
        publicBaseUrl: "https://assets.example.test",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      recordInsertRequired(connection.db, projectStorageLocationTable, {
        id: "location-project-1-legacy",
        projectId: "project-1",
        environment: "production",
        bucket: "active-historical",
        prefix: "legacy",
        createdAt: timestamp,
      })
      recordInsertRequired(connection.db, projectTable, {
        ...project,
        id: "project-2",
        slug: "archived-project",
        archiveState: "archived",
      })
      recordInsertRequired(connection.db, environmentTable, {
        id: "environment-project-2-production",
        projectId: "project-2",
        name: "production",
        r2Bucket: "deleted-dedicated",
        r2Prefix: "archived",
        publicBaseUrl: "https://archived.assets.example.test",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      recordInsertRequired(connection.db, projectStorageLocationTable, {
        id: "location-project-2-shared",
        projectId: "project-2",
        environment: "production",
        bucket: "shared-live",
        prefix: "archived",
        createdAt: timestamp,
      })
      recordInsertRequired(connection.db, projectTable, { ...project, id: "project-3", slug: "shared-project" })
      recordInsertRequired(connection.db, environmentTable, {
        id: "environment-project-3-production",
        projectId: "project-3",
        name: "production",
        r2Bucket: "shared-live",
        r2Prefix: "active",
        publicBaseUrl: "https://shared.assets.example.test",
        createdAt: timestamp,
        updatedAt: timestamp,
      })

      const bindings = repository.liveStorageBindingsRead?.()

      expect(bindings).toMatchObject({ success: true })
      if (bindings?.success)
        expect(bindings.data.map((binding) => binding.bucket)).toEqual([
          "active-current",
          "active-historical",
          "shared-live",
        ])
    } finally {
      await cleanup(databasePath, connection)
    }
  })
})

describe("projectRepository.projectCreate", () => {
  test("creates an organization, project binding, both environments, and an admin grant record atomically", async () => {
    const { databasePath, connection, repository } = await emptyRepositoryCreate()
    try {
      const first = repository.projectCreate(projectCreateInput, "admin-1")
      expect(first.success).toBe(true)
      if (!first.success) return
      expect(first.data.created).toBe(true)
      expect(first.data.project.organization?.slug).toBe("new-organization")
      expect(first.data.project.environments.map((environment) => environment.name).sort()).toEqual([
        "development",
        "production",
      ])

      const projectId = first.data.project.project.id
      expect(connection.db.select().from(organizationTable).all()).toHaveLength(1)
      expect(connection.db.select().from(projectTable).all()).toHaveLength(1)
      expect(connection.db.select().from(projectBindingTable).all()).toHaveLength(1)
      expect(
        connection.db.select().from(environmentTable).where(eq(environmentTable.projectId, projectId)).all(),
      ).toHaveLength(2)
      expect(
        connection.db.select().from(projectGrantTable).where(eq(projectGrantTable.projectId, projectId)).all(),
      ).toMatchObject([{ subjectId: "admin-1", role: "admin" }])
      expect(
        connection.db
          .select()
          .from(projectStorageLocationTable)
          .where(eq(projectStorageLocationTable.projectId, projectId))
          .all(),
      ).toMatchObject([
        { environment: "development", bucket: "assets-development", prefix: "registered/development" },
        { environment: "production", bucket: "assets-production", prefix: "registered/production" },
      ])

      const repeated = repository.projectCreate(projectCreateInput, "admin-2")
      expect(repeated).toMatchObject({
        success: true,
        data: { created: false, project: { project: { id: projectId } } },
      })
      expect(
        connection.db.select().from(projectGrantTable).where(eq(projectGrantTable.projectId, projectId)).all(),
      ).toMatchObject([{ subjectId: "admin-1", role: "admin" }])

      const changed = repository.projectCreate({ ...projectCreateInput, name: "Changed" }, "admin-1")
      expect(changed.success).toBe(false)
      if (!changed.success) expect(changed.errorMessage).toContain("already exists")
      expect(connection.db.select().from(projectTable).all()).toHaveLength(1)
    } finally {
      await cleanup(databasePath, connection)
    }
  })

  test("attaches a new project to an existing organization", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      const created = repository.projectCreate(
        {
          ...projectCreateInput,
          organization: { id: "org-1", name: "Renamed locally", slug: "example" },
          slug: "attached-project",
          binding: { zitadelProjectId: "zitadel-attached", serviceProjectId: "service-attached" },
        },
        "admin-1",
      )
      expect(created.success).toBe(true)
      if (!created.success) return
      expect(created.data.project.organization?.id).toBe("org-1")
      expect(connection.db.select().from(organizationTable).all()).toHaveLength(1)
    } finally {
      await cleanup(databasePath, connection)
    }
  })

  test("allows a project slug in another organization but rejects it within the same organization", async () => {
    const { databasePath, connection, repository } = await emptyRepositoryCreate()
    try {
      const first = repository.projectCreate(projectCreateInput, "admin-1")
      expect(first.success).toBe(true)

      const second = repository.projectCreate(
        {
          ...projectCreateInput,
          organization: { id: "org-second", name: "Second organization", slug: "second-organization" },
          binding: { zitadelProjectId: "zitadel-second", serviceProjectId: "service-second" },
        },
        "admin-2",
      )
      expect(second).toMatchObject({ success: true, data: { created: true } })
      if (!first.success || !second.success) return
      expect(second.data.project.project.id).not.toBe(first.data.project.project.id)

      const duplicate = repository.projectCreate(
        {
          ...projectCreateInput,
          binding: { zitadelProjectId: "zitadel-duplicate", serviceProjectId: "service-duplicate" },
        },
        "admin-3",
      )
      expect(duplicate.success).toBe(false)
      if (!duplicate.success) expect(duplicate.errorMessage).toContain("already exists")
      expect(connection.db.select().from(projectTable).all()).toHaveLength(2)
    } finally {
      await cleanup(databasePath, connection)
    }
  })

  test("rejects a binding collision without creating a partial project", async () => {
    const { databasePath, connection, repository } = await repositoryCreate()
    try {
      const conflicting = repository.projectCreate(
        {
          ...projectCreateInput,
          organization: { id: "org-1", name: "Example", slug: "example" },
          name: "Another project",
          slug: "another-project",
          binding: { zitadelProjectId: "zitadel-1", serviceProjectId: "service-new" },
        },
        "admin-2",
      )
      expect(conflicting.success).toBe(false)
      if (!conflicting.success) expect(conflicting.errorMessage).toContain("already exists")
      expect(connection.db.select().from(projectTable).all()).toHaveLength(1)
      expect(connection.db.select().from(projectBindingTable).all()).toHaveLength(1)
      expect(connection.db.select().from(environmentTable).all()).toHaveLength(0)
    } finally {
      await cleanup(databasePath, connection)
    }
  })
})
