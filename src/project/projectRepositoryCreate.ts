import { and, asc, eq, inArray, or } from "drizzle-orm"
import * as v from "valibot"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { organizationTable } from "../infrastructure/db/schema/organizationTable.js"
import { projectBindingTable } from "../infrastructure/db/schema/projectBindingTable.js"
import { projectTable } from "../infrastructure/db/schema/projectTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type Environment, environmentSchema } from "./environmentSchema.js"
import { type Organization, organizationSchema } from "./organizationSchema.js"
import { type ProjectBinding, projectBindingSchema } from "./projectBindingSchema.js"
import type { ProjectRepository } from "./projectRepository.js"
import { type Project, projectSchema } from "./projectSchema.js"
import { type ProjectSettings, projectSettingsSchema } from "./projectSettingsSchema.js"
import { type ProjectSettingsUpdate, projectSettingsUpdateSchema } from "./projectSettingsUpdateSchema.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"

type ProjectRecord = typeof projectTable.$inferSelect
type EnvironmentRecord = typeof environmentTable.$inferSelect
type OrganizationRecord = typeof organizationTable.$inferSelect
type ProjectBindingRecord = typeof projectBindingTable.$inferSelect

const projectRead = (record: ProjectRecord): Result<Project> => {
  const parsed = v.safeParse(projectSchema, record)
  if (!parsed.success) return resultErrorCreate("projectRepositoryProjectRead", "The stored project was invalid")
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

export const projectRepositoryCreate = (db: AssetDatabase): ProjectRepository => {
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

  const projectsRead = (organizationId: string, zitadelProjectIds: readonly string[]): Result<readonly Project[]> => {
    if (zitadelProjectIds.length === 0) return { success: true, data: [] }
    try {
      const records = db
        .select({ project: projectTable })
        .from(projectTable)
        .innerJoin(projectBindingTable, eq(projectBindingTable.projectId, projectTable.id))
        .where(
          and(
            eq(projectTable.organizationId, organizationId),
            inArray(projectBindingTable.zitadelProjectId, [...zitadelProjectIds]),
          ),
        )
        .orderBy(asc(projectTable.name), asc(projectTable.id))
        .all()
      const projects: Project[] = []
      for (const record of records) {
        const project = projectRead(record.project)
        if (!project.success) return project
        projects.push(project.data)
      }
      return { success: true, data: projects }
    } catch (error) {
      return resultErrorCreate("projectRepositoryProjectsRead", "The projects could not be read", error)
    }
  }

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
    const now = new Date().toISOString()
    const written = databaseTransactionRun(db, (transaction) => {
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
          continue
        }
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
      }
      return { success: true, data: null } as const
    })
    if (!written.success) return written
    return projectSettingsRead(project.id)
  }

  return {
    projectsRead,
    projectRead: projectReadByIdentifier,
    projectBindingRead,
    environmentsRead,
    environmentRead: environmentReadByIdentifier,
    projectSettingsRead,
    projectSettingsWrite,
    organizationRead: organizationReadById,
  }
}
