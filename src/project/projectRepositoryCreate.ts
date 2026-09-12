import { and, asc, count, eq, inArray, or, sql } from "drizzle-orm"
import * as v from "valibot"

import { type ProjectListItem, projectListItemSchema } from "../api-client/projectListItemSchema.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { organizationTable } from "../infrastructure/db/schema/organizationTable.js"
import { projectBindingTable } from "../infrastructure/db/schema/projectBindingTable.js"
import { projectGrantTable } from "../infrastructure/db/schema/projectGrantTable.js"
import { projectStorageLocationTable } from "../infrastructure/db/schema/projectStorageLocationTable.js"
import { projectTable } from "../infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../infrastructure/db/schema/sourceRevisionTable.js"
import { storageMigrationRepositoryCreate } from "../migration/storageMigrationRepositoryCreate.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { storageBindingResolve } from "../storage/storageBindingResolve.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import { storageMutationAssert } from "../storage/storageMutationAssert.js"
import { type Environment, environmentSchema } from "./environmentSchema.js"
import { type Organization, organizationSchema } from "./organizationSchema.js"
import { type ProjectArchiveState, projectArchiveStateSchema } from "./projectArchiveStateSchema.js"
import { type ProjectBinding, projectBindingSchema } from "./projectBindingSchema.js"
import type { ProjectCreateResult } from "./projectCreateResultSchema.js"
import { type ProjectCreate, projectCreateSchema } from "./projectCreateSchema.js"
import type { ProjectRepository } from "./projectRepository.js"
import { type Project, projectSchema } from "./projectSchema.js"
import { type ProjectSettings, projectSettingsSchema } from "./projectSettingsSchema.js"
import { type ProjectSettingsUpdate, projectSettingsUpdateSchema } from "./projectSettingsUpdateSchema.js"
import { projectStorageLocationRepositoryCreate } from "./projectStorageLocationRepositoryCreate.js"

type ProjectRecord = typeof projectTable.$inferSelect
type EnvironmentRecord = typeof environmentTable.$inferSelect
type OrganizationRecord = typeof organizationTable.$inferSelect
type ProjectBindingRecord = typeof projectBindingTable.$inferSelect

type ProjectCreateExisting = {
  project: ProjectRecord | null
  binding: ProjectBindingRecord | null
}

const projectCreateExistingRead = (db: AssetDatabase, input: ProjectCreate): Result<ProjectCreateExisting> => {
  try {
    const projectBySlug = db
      .select()
      .from(projectTable)
      .where(and(eq(projectTable.organizationId, input.organization.id), eq(projectTable.slug, input.slug)))
      .limit(1)
      .get()
    const bindings = db
      .select()
      .from(projectBindingTable)
      .where(
        or(
          eq(projectBindingTable.zitadelProjectId, input.binding.zitadelProjectId),
          eq(projectBindingTable.serviceProjectId, input.binding.serviceProjectId),
        ),
      )
      .all()
    const projectIds = new Set<string>([
      ...(projectBySlug === undefined ? [] : [projectBySlug.id]),
      ...bindings.map((binding) => binding.projectId),
    ])
    if (projectIds.size > 1)
      return resultErrorCreate(
        "projectRepositoryProjectCreate",
        "The project registration already exists with conflicts",
      )
    const projectId = [...projectIds][0]
    if (projectId === undefined) return { success: true, data: { project: null, binding: null } }
    const project =
      projectBySlug?.id === projectId
        ? projectBySlug
        : db.select().from(projectTable).where(eq(projectTable.id, projectId)).limit(1).get()
    const binding =
      bindings.find((candidate) => candidate.projectId === projectId) ??
      db.select().from(projectBindingTable).where(eq(projectBindingTable.projectId, projectId)).limit(1).get()
    return { success: true, data: { project: project ?? null, binding: binding ?? null } }
  } catch (error) {
    return resultErrorCreate("projectRepositoryProjectCreate", "The existing project could not be read", error)
  }
}

const projectCreateMatchesRead = (
  db: AssetDatabase,
  input: ProjectCreate,
  existing: ProjectCreateExisting,
): Result<boolean> => {
  if (existing.project === null || existing.binding === null) return { success: true, data: false }
  try {
    const environments = db
      .select()
      .from(environmentTable)
      .where(eq(environmentTable.projectId, existing.project.id))
      .all()
    const environmentsMatch =
      environments.length === input.environments.length &&
      input.environments.every((expected) => {
        const actual = environments.find((candidate) => candidate.name === expected.name)
        return (
          actual !== undefined &&
          actual.r2Bucket === expected.r2Bucket &&
          actual.r2Prefix === expected.r2Prefix &&
          actual.publicBaseUrl === expected.publicBaseUrl
        )
      })
    return {
      success: true,
      data:
        existing.project.organizationId === input.organization.id &&
        existing.project.name === input.name &&
        existing.project.slug === input.slug &&
        existing.project.defaultEnvironment === input.defaultEnvironment &&
        existing.binding.organizationId === input.organization.id &&
        existing.binding.zitadelProjectId === input.binding.zitadelProjectId &&
        existing.binding.serviceProjectId === input.binding.serviceProjectId &&
        environmentsMatch,
    }
  } catch (error) {
    return resultErrorCreate("projectRepositoryProjectCreate", "The existing project could not be checked", error)
  }
}

const projectRead = (record: ProjectRecord): Result<Project> => {
  const parsed = v.safeParse(projectSchema, record)
  if (!parsed.success) return resultErrorCreate("projectRepositoryProjectRead", "The stored project was invalid")
  return { success: true, data: parsed.output }
}

const projectListItemRead = (
  record: ProjectRecord,
  organizationSlug: string,
  assetCount: number,
  totalFileSize: number,
): Result<ProjectListItem> => {
  const parsed = v.safeParse(projectListItemSchema, { ...record, organizationSlug, assetCount, totalFileSize })
  if (!parsed.success)
    return resultErrorCreate("projectRepositoryProjectListItemRead", "The stored project list item was invalid")
  return { success: true, data: parsed.output }
}

const environmentRead = (record: EnvironmentRecord): Result<Environment> => {
  const parsed = v.safeParse(environmentSchema, record)
  if (!parsed.success)
    return resultErrorCreate("projectRepositoryEnvironmentRead", "The stored environment was invalid")
  return { success: true, data: parsed.output }
}

const organizationRead = (record: OrganizationRecord): Result<Organization> => {
  const parsed = v.safeParse(organizationSchema, record)
  if (!parsed.success)
    return resultErrorCreate("projectRepositoryOrganizationRead", "The stored organization was invalid")
  return { success: true, data: parsed.output }
}

const bindingRead = (record: ProjectBindingRecord): Result<ProjectBinding> => {
  const parsed = v.safeParse(projectBindingSchema, record)
  if (!parsed.success)
    return resultErrorCreate("projectRepositoryBindingRead", "The stored project binding was invalid")
  return { success: true, data: parsed.output }
}

const projectArchiveStateTransitionAllowed = (current: ProjectArchiveState, next: ProjectArchiveState): boolean =>
  current === next ||
  (current === "active" && next === "archiving") ||
  (current === "archiving" && next === "archived") ||
  (current === "archived" && next === "unarchiving") ||
  (current === "unarchiving" && next === "active")

type ProjectRepositoryImplementation = ProjectRepository & {
  projectArchiveStateWrite: NonNullable<ProjectRepository["projectArchiveStateWrite"]>
  projectStorageLocationsRead: NonNullable<ProjectRepository["projectStorageLocationsRead"]>
  liveStorageBindingsRead: NonNullable<ProjectRepository["liveStorageBindingsRead"]>
}

export const projectRepositoryCreate = (db: AssetDatabase): ProjectRepositoryImplementation => {
  const storageMigrationRepository = storageMigrationRepositoryCreate(db)
  const projectStorageLocationRepository = projectStorageLocationRepositoryCreate(db)
  const projectRecordRead = (projectIdentifier: string): Result<ProjectRecord | null> => {
    try {
      const direct = db.select().from(projectTable).where(eq(projectTable.id, projectIdentifier)).limit(1).get()
      if (direct) return { success: true, data: direct }

      const binding = db
        .select({ projectId: projectBindingTable.projectId })
        .from(projectBindingTable)
        .where(eq(projectBindingTable.serviceProjectId, projectIdentifier))
        .limit(1)
        .get()
      if (!binding) return { success: true, data: null }
      const project = db.select().from(projectTable).where(eq(projectTable.id, binding.projectId)).limit(1).get()
      return { success: true, data: project ?? null }
    } catch (error) {
      return resultErrorCreate("projectRepositoryProjectRecordRead", "The project could not be read", error)
    }
  }

  const bindingRecordRead = (projectIdentifier: string): Result<ProjectBindingRecord | null> => {
    try {
      const record = db
        .select()
        .from(projectBindingTable)
        .where(
          or(
            eq(projectBindingTable.projectId, projectIdentifier),
            eq(projectBindingTable.serviceProjectId, projectIdentifier),
          ),
        )
        .limit(1)
        .get()
      return { success: true, data: record ?? null }
    } catch (error) {
      return resultErrorCreate("projectRepositoryBindingRecordRead", "The project binding could not be read", error)
    }
  }

  const environmentsRead = (projectId: string): Result<readonly Environment[]> => {
    try {
      const records = db
        .select()
        .from(environmentTable)
        .where(eq(environmentTable.projectId, projectId))
        .orderBy(asc(environmentTable.name), asc(environmentTable.id))
        .all()
      const environments: Environment[] = []
      for (const record of records) {
        const environment = environmentRead(record)
        if (!environment.success) return environment
        environments.push(environment.data)
      }
      return { success: true, data: environments }
    } catch (error) {
      return resultErrorCreate("projectRepositoryEnvironmentsRead", "The environments could not be read", error)
    }
  }

  const projectReadByIdentifier = (projectIdentifier: string): Result<Project | null> => {
    const record = projectRecordRead(projectIdentifier)
    if (!record.success) return record
    if (!record.data) return { success: true, data: null }
    return projectRead(record.data)
  }

  const projectBindingRead = (projectIdentifier: string): Result<ProjectBinding | null> => {
    const record = bindingRecordRead(projectIdentifier)
    if (!record.success) return record
    if (!record.data) return { success: true, data: null }
    return bindingRead(record.data)
  }

  const projectsRead = (
    organizationId: string,
    zitadelProjectIds: readonly string[],
    organizationAdmin = false,
    includeArchived = false,
    projectAdministrator = false,
  ): Result<readonly ProjectListItem[]> => {
    if (!organizationAdmin && zitadelProjectIds.length === 0) return { success: true, data: [] }
    try {
      const projectFilter = organizationAdmin
        ? undefined
        : inArray(projectBindingTable.zitadelProjectId, [...zitadelProjectIds])
      const archiveFilter =
        (organizationAdmin || projectAdministrator) && includeArchived
          ? undefined
          : eq(projectTable.archiveState, "active")
      const records = db
        .select({
          project: projectTable,
          organizationSlug: organizationTable.slug,
          assetCount: count(assetTable.id),
          totalFileSize: sql<number>`coalesce(sum(${sourceRevisionTable.byteSize}), 0)`,
        })
        .from(projectTable)
        .innerJoin(projectBindingTable, eq(projectBindingTable.projectId, projectTable.id))
        .innerJoin(organizationTable, eq(organizationTable.id, projectTable.organizationId))
        .leftJoin(assetTable, eq(assetTable.projectId, projectTable.id))
        .leftJoin(
          sourceRevisionTable,
          and(
            eq(sourceRevisionTable.id, assetTable.currentSourceRevisionId),
            eq(sourceRevisionTable.assetId, assetTable.id),
          ),
        )
        .where(
          and(
            eq(projectTable.organizationId, organizationId),
            eq(projectBindingTable.organizationId, organizationId),
            ...(archiveFilter === undefined ? [] : [archiveFilter]),
            ...(projectFilter === undefined ? [] : [projectFilter]),
          ),
        )
        .groupBy(projectTable.id)
        .orderBy(asc(projectTable.name), asc(projectTable.id))
        .all()
      const projects: ProjectListItem[] = []
      for (const record of records) {
        const project = projectListItemRead(
          record.project,
          record.organizationSlug,
          record.assetCount,
          record.totalFileSize,
        )
        if (!project.success) return project
        projects.push(project.data)
      }
      return { success: true, data: projects }
    } catch (error) {
      return resultErrorCreate("projectRepositoryProjectsRead", "The projects could not be read", error)
    }
  }

  const projectArchiveStateWrite = (
    projectIdentifier: string,
    archiveState: ProjectArchiveState,
    expectedArchiveState?: ProjectArchiveState,
  ): Result<Project | null> => {
    const op = "projectRepositoryProjectArchiveStateWrite"
    const parsed = v.safeParse(projectArchiveStateSchema, archiveState)
    if (!parsed.success) return resultErrorCreate(op, "The project archive state was invalid", archiveState)
    const record = projectRecordRead(projectIdentifier)
    if (!record.success) return record
    if (!record.data) return { success: true, data: null }
    if (expectedArchiveState !== undefined && record.data.archiveState !== expectedArchiveState)
      return resultErrorCreate(op, "The project archive state transition was not allowed")
    if (!projectArchiveStateTransitionAllowed(record.data.archiveState, parsed.output))
      return resultErrorCreate(op, "The project archive state transition was not allowed")
    const transitionExpectedArchiveState = expectedArchiveState ?? record.data.archiveState
    try {
      const updated = db
        .update(projectTable)
        .set({ archiveState: parsed.output, updatedAt: new Date().toISOString() })
        .where(and(eq(projectTable.id, record.data.id), eq(projectTable.archiveState, transitionExpectedArchiveState)))
        .returning({ id: projectTable.id })
        .get()
      if (updated === undefined) return resultErrorCreate(op, "The project archive state transition was not allowed")
      return projectReadByIdentifier(record.data.id)
    } catch (error) {
      return resultErrorCreate(op, "The project archive state could not be written", error)
    }
  }

  const projectGrantIdsRead = (organizationId: string): Result<readonly string[]> => {
    try {
      const records = db
        .select({ zitadelProjectId: projectBindingTable.zitadelProjectId })
        .from(projectBindingTable)
        .where(eq(projectBindingTable.organizationId, organizationId))
        .all()
      return { success: true, data: records.map((record) => record.zitadelProjectId) }
    } catch (error) {
      return resultErrorCreate("projectRepositoryProjectGrantIdsRead", "The project grants could not be read", error)
    }
  }

  const storageBindingsRead = (): Result<readonly StorageBinding[]> => {
    try {
      const records = db.select().from(environmentTable).all()
      const currentBindings: StorageBinding[] = []
      for (const record of records) {
        const environment = environmentRead(record)
        if (!environment.success) return environment
        const binding = storageBindingResolve(environment.data)
        if (!binding.success) return binding
        currentBindings.push(binding.data)
      }
      const locations = projectStorageLocationRepository.projectStorageLocationsAllRead()
      if (!locations.success) return locations
      const publicBaseUrls = new Map(
        currentBindings.map((binding) => [`${binding.projectId}\u0000${binding.environment}`, binding.publicBaseUrl]),
      )
      const bindings = new Map<string, StorageBinding>()
      for (const binding of currentBindings)
        bindings.set(
          `${binding.projectId}\u0000${binding.environment}\u0000${binding.bucket}\u0000${binding.prefix}`,
          binding,
        )
      for (const location of locations.data) {
        const binding = {
          projectId: location.projectId,
          environment: location.environment,
          bucket: location.bucket,
          prefix: location.prefix,
          publicBaseUrl:
            publicBaseUrls.get(`${location.projectId}\u0000${location.environment}`) ?? "https://archive.invalid",
        } satisfies StorageBinding
        bindings.set(
          `${binding.projectId}\u0000${binding.environment}\u0000${binding.bucket}\u0000${binding.prefix}`,
          binding,
        )
      }
      return { success: true, data: [...bindings.values()] }
    } catch (error) {
      return resultErrorCreate("projectRepositoryStorageBindingsRead", "The storage bindings could not be read", error)
    }
  }

  const liveStorageBindingsRead = (): Result<readonly StorageBinding[]> => {
    const op = "projectRepositoryLiveStorageBindingsRead"
    try {
      const currentRecords = db
        .select({ environment: environmentTable })
        .from(environmentTable)
        .innerJoin(projectTable, eq(projectTable.id, environmentTable.projectId))
        .where(eq(projectTable.archiveState, "active"))
        .orderBy(asc(environmentTable.projectId), asc(environmentTable.name), asc(environmentTable.id))
        .all()
      const currentBindings: StorageBinding[] = []
      for (const record of currentRecords) {
        const environment = environmentRead(record.environment)
        if (!environment.success) return environment
        const binding = storageBindingResolve(environment.data)
        if (!binding.success) return binding
        currentBindings.push(binding.data)
      }
      const historicalRecords = db
        .select({ location: projectStorageLocationTable })
        .from(projectStorageLocationTable)
        .innerJoin(projectTable, eq(projectTable.id, projectStorageLocationTable.projectId))
        .where(eq(projectTable.archiveState, "active"))
        .orderBy(
          asc(projectStorageLocationTable.projectId),
          asc(projectStorageLocationTable.environment),
          asc(projectStorageLocationTable.bucket),
          asc(projectStorageLocationTable.prefix),
          asc(projectStorageLocationTable.id),
        )
        .all()
      const publicBaseUrls = new Map(
        currentBindings.map((binding) => [`${binding.projectId}\u0000${binding.environment}`, binding.publicBaseUrl]),
      )
      const bindings = new Map<string, StorageBinding>()
      for (const binding of currentBindings)
        bindings.set(
          `${binding.projectId}\u0000${binding.environment}\u0000${binding.bucket}\u0000${binding.prefix}`,
          binding,
        )
      for (const record of historicalRecords) {
        const location = record.location
        const binding = {
          projectId: location.projectId,
          environment: location.environment,
          bucket: location.bucket,
          prefix: location.prefix,
          publicBaseUrl:
            publicBaseUrls.get(`${location.projectId}\u0000${location.environment}`) ?? "https://archive.invalid",
        } satisfies StorageBinding
        bindings.set(
          `${binding.projectId}\u0000${binding.environment}\u0000${binding.bucket}\u0000${binding.prefix}`,
          binding,
        )
      }
      return {
        success: true,
        data: [...bindings.values()].sort((left, right) =>
          `${left.projectId}\u0000${left.environment}\u0000${left.bucket}\u0000${left.prefix}`.localeCompare(
            `${right.projectId}\u0000${right.environment}\u0000${right.bucket}\u0000${right.prefix}`,
          ),
        ),
      }
    } catch (error) {
      return resultErrorCreate(op, "The live storage bindings could not be read", error)
    }
  }

  const projectStorageLocationsRead = (projectId: string) =>
    projectStorageLocationRepository.projectStorageLocationsRead(projectId)

  const environmentReadByIdentifier = (
    projectId: string,
    environmentIdentifier: string,
  ): Result<Environment | null> => {
    try {
      const record = db
        .select()
        .from(environmentTable)
        .where(
          and(
            eq(environmentTable.projectId, projectId),
            or(
              eq(environmentTable.id, environmentIdentifier),
              eq(environmentTable.name, environmentIdentifier as "development" | "production"),
            ),
          ),
        )
        .limit(1)
        .get()
      if (!record) return { success: true, data: null }
      return environmentRead(record)
    } catch (error) {
      return resultErrorCreate("projectRepositoryEnvironmentRead", "The environment could not be read", error)
    }
  }

  const organizationReadById = (organizationId: string): Result<Organization | null> => {
    try {
      const record = db.select().from(organizationTable).where(eq(organizationTable.id, organizationId)).limit(1).get()
      if (!record) return { success: true, data: null }
      return organizationRead(record)
    } catch (error) {
      return resultErrorCreate("projectRepositoryOrganizationRead", "The organization could not be read", error)
    }
  }

  const organizationReadBySlug = (organizationSlug: string): Result<Organization | null> => {
    try {
      const record = db
        .select()
        .from(organizationTable)
        .where(eq(organizationTable.slug, organizationSlug))
        .limit(1)
        .get()
      if (!record) return { success: true, data: null }
      return organizationRead(record)
    } catch (error) {
      return resultErrorCreate("projectRepositoryOrganizationReadBySlug", "The organization could not be read", error)
    }
  }

  const projectReadByOrganizationIdAndSlug = (organizationId: string, projectSlug: string): Result<Project | null> => {
    try {
      const record = db
        .select()
        .from(projectTable)
        .where(and(eq(projectTable.organizationId, organizationId), eq(projectTable.slug, projectSlug)))
        .limit(1)
        .get()
      if (!record) return { success: true, data: null }
      return projectRead(record)
    } catch (error) {
      return resultErrorCreate(
        "projectRepositoryProjectReadByOrganizationIdAndSlug",
        "The project could not be read",
        error,
      )
    }
  }

  const projectSettingsRead = (projectIdentifier: string): Result<ProjectSettings | null> => {
    const project = projectReadByIdentifier(projectIdentifier)
    if (!project.success) return project
    if (!project.data) return { success: true, data: null }
    const organization = organizationReadById(project.data.organizationId)
    if (!organization.success) return organization
    const binding = projectBindingRead(project.data.id)
    if (!binding.success) return binding
    const environments = environmentsRead(project.data.id)
    if (!environments.success) return environments
    const parsed = v.safeParse(projectSettingsSchema, {
      project: project.data,
      organization: organization.data,
      binding: binding.data,
      environments: environments.data,
    })
    if (!parsed.success)
      return resultErrorCreate("projectRepositoryProjectSettingsRead", "The project settings were invalid")
    return { success: true, data: parsed.output }
  }

  const projectSettingsWrite = (
    projectIdentifier: string,
    input: ProjectSettingsUpdate,
  ): Result<ProjectSettings | null> => {
    const op = "projectRepositoryProjectSettingsWrite"
    const parsed = v.safeParse(projectSettingsUpdateSchema, input)
    if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), input)
    const record = projectRecordRead(projectIdentifier)
    if (!record.success) return record
    if (!record.data) return { success: true, data: null }

    const project = record.data
    if (project.archiveState !== "active")
      return resultErrorCreate(op, "Project settings cannot be changed during archive lifecycle operations")
    const environments = db.select().from(environmentTable).where(eq(environmentTable.projectId, project.id)).all()
    const changedEnvironmentIds = parsed.output.environments.flatMap((environment) => {
      const current = environments.find((candidate) => candidate.name === environment.name)
      if (
        current !== undefined &&
        (current.r2Bucket !== environment.r2Bucket ||
          current.r2Prefix !== environment.r2Prefix ||
          current.publicBaseUrl !== environment.publicBaseUrl)
      )
        return [current.id]
      return []
    })
    const admitted = storageMutationAssert(storageMigrationRepository, changedEnvironmentIds)
    if (!admitted.success) return admitted
    const now = new Date().toISOString()
    const written = databaseTransactionRun(
      db,
      (transaction) => {
        const transactionAdmitted = storageMutationAssert(
          storageMigrationRepositoryCreate(transaction),
          changedEnvironmentIds,
        )
        if (!transactionAdmitted.success) return transactionAdmitted
        transaction
          .update(projectTable)
          .set({ name: parsed.output.name, defaultEnvironment: parsed.output.defaultEnvironment, updatedAt: now })
          .where(eq(projectTable.id, project.id))
          .run()

        const binding = transaction
          .select()
          .from(projectBindingTable)
          .where(eq(projectBindingTable.projectId, project.id))
          .limit(1)
          .get()
        if (binding)
          transaction
            .update(projectBindingTable)
            .set({ ...parsed.output.binding, updatedAt: now })
            .where(eq(projectBindingTable.id, binding.id))
            .run()
        else
          transaction
            .insert(projectBindingTable)
            .values({
              id: crypto.randomUUID(),
              projectId: project.id,
              organizationId: project.organizationId,
              ...parsed.output.binding,
              createdAt: now,
              updatedAt: now,
            })
            .run()

        const existing = transaction
          .select()
          .from(environmentTable)
          .where(eq(environmentTable.projectId, project.id))
          .all()
        for (const environment of parsed.output.environments) {
          const current = existing.find((candidate) => candidate.name === environment.name)
          if (current) {
            transaction
              .update(environmentTable)
              .set({
                r2Bucket: environment.r2Bucket,
                r2Prefix: environment.r2Prefix,
                publicBaseUrl: environment.publicBaseUrl,
                updatedAt: now,
              })
              .where(eq(environmentTable.id, current.id))
              .run()
          } else
            transaction
              .insert(environmentTable)
              .values({
                id: crypto.randomUUID(),
                projectId: project.id,
                name: environment.name,
                r2Bucket: environment.r2Bucket,
                r2Prefix: environment.r2Prefix,
                publicBaseUrl: environment.publicBaseUrl,
                createdAt: now,
                updatedAt: now,
              })
              .run()
          const recorded = projectStorageLocationRepository.projectStorageLocationCreate(
            {
              projectId: project.id,
              environment: environment.name,
              bucket: environment.r2Bucket,
              prefix: environment.r2Prefix,
            },
            transaction,
          )
          if (!recorded.success) return recorded
        }
        return { success: true, data: null } as const
      },
      { behavior: "immediate" },
    )
    if (!written.success) return written
    return projectSettingsRead(project.id)
  }

  const projectCreate = (input: ProjectCreate, initialAdminSubjectId: string): Result<ProjectCreateResult> => {
    const op = "projectRepositoryProjectCreate"
    const parsed = v.safeParse(projectCreateSchema, input)
    if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), input)
    const subject = v.safeParse(v.pipe(v.string(), v.minLength(1), v.maxLength(256)), initialAdminSubjectId)
    if (!subject.success) return resultErrorCreate(op, "The initial administrator subject was invalid")

    const written = databaseTransactionRun<{ projectId: string; created: boolean }>(
      db,
      (transaction) => {
        const organizations = transaction
          .select()
          .from(organizationTable)
          .where(
            or(
              eq(organizationTable.id, parsed.output.organization.id),
              eq(organizationTable.slug, parsed.output.organization.slug),
            ),
          )
          .all()
        const organizationById = organizations.find((organization) => organization.id === parsed.output.organization.id)
        const organizationBySlug = organizations.find(
          (organization) => organization.slug === parsed.output.organization.slug,
        )
        if (organizationById !== undefined && organizationById.slug !== parsed.output.organization.slug)
          return resultErrorCreate(op, "The organization is already registered with a different slug")
        if (organizationBySlug !== undefined && organizationBySlug.id !== parsed.output.organization.id)
          return resultErrorCreate(op, "The organization slug is already registered to another organization")

        const existing = projectCreateExistingRead(transaction, parsed.output)
        if (!existing.success) return existing
        if (existing.data.project !== null || existing.data.binding !== null) {
          if (existing.data.project === null)
            return resultErrorCreate(op, "The project registration already exists without its project")
          const matches = projectCreateMatchesRead(transaction, parsed.output, existing.data)
          if (!matches.success) return matches
          if (!matches.data) return resultErrorCreate(op, "The project registration already exists with different data")
          return { success: true, data: { projectId: existing.data.project.id, created: false } } as const
        }

        const organizationId = parsed.output.organization.id
        const now = new Date().toISOString()
        if (organizationById === undefined && organizationBySlug === undefined)
          transaction
            .insert(organizationTable)
            .values({
              id: organizationId,
              name: parsed.output.organization.name,
              slug: parsed.output.organization.slug,
              createdAt: now,
              updatedAt: now,
            })
            .run()

        const projectId = crypto.randomUUID()
        transaction
          .insert(projectTable)
          .values({
            id: projectId,
            organizationId,
            name: parsed.output.name,
            slug: parsed.output.slug,
            defaultEnvironment: parsed.output.defaultEnvironment,
            createdAt: now,
            updatedAt: now,
          })
          .run()
        transaction
          .insert(projectBindingTable)
          .values({
            id: crypto.randomUUID(),
            projectId,
            organizationId,
            ...parsed.output.binding,
            createdAt: now,
            updatedAt: now,
          })
          .run()
        for (const environment of parsed.output.environments)
          transaction
            .insert(environmentTable)
            .values({
              id: crypto.randomUUID(),
              projectId,
              name: environment.name,
              r2Bucket: environment.r2Bucket,
              r2Prefix: environment.r2Prefix,
              publicBaseUrl: environment.publicBaseUrl,
              createdAt: now,
              updatedAt: now,
            })
            .run()
        for (const environment of parsed.output.environments) {
          const recorded = projectStorageLocationRepository.projectStorageLocationCreate(
            {
              projectId,
              environment: environment.name,
              bucket: environment.r2Bucket,
              prefix: environment.r2Prefix,
            },
            transaction,
          )
          if (!recorded.success) return recorded
        }
        // Keep this existing database record for project metadata; runtime authorization remains claims-based.
        transaction
          .insert(projectGrantTable)
          .values({
            id: crypto.randomUUID(),
            projectId,
            organizationId,
            subjectId: subject.output,
            role: "admin",
            createdAt: now,
            updatedAt: now,
          })
          .run()
        return { success: true, data: { projectId, created: true } } as const
      },
      { behavior: "immediate" },
    )
    if (!written.success) {
      if (/unique|constraint/i.test(written.errorMessage))
        return resultErrorCreate(op, "The project registration already exists with conflicts", written)
      return written
    }
    const settings = projectSettingsRead(written.data.projectId)
    if (!settings.success) return settings
    if (!settings.data) return resultErrorCreate(op, "The created project could not be read")
    return { success: true, data: { project: settings.data, created: written.data.created } }
  }

  return {
    projectsRead,
    projectRead: projectReadByIdentifier,
    projectBindingRead,
    environmentsRead,
    environmentRead: environmentReadByIdentifier,
    projectSettingsRead,
    projectSettingsWrite,
    projectStorageLocationsRead,
    projectArchiveStateWrite,
    projectCreate,
    organizationRead: organizationReadById,
    organizationReadBySlug,
    projectReadByOrganizationIdAndSlug,
    projectGrantIdsRead,
    storageBindingsRead,
    liveStorageBindingsRead,
  }
}
