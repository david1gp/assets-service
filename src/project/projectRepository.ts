import type { ProjectListItem } from "../api-client/projectListItemSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { Environment } from "./environmentSchema.js"
import type { Organization } from "./organizationSchema.js"
import type { ProjectBinding } from "./projectBindingSchema.js"
import type { ProjectCreateResult } from "./projectCreateResultSchema.js"
import type { ProjectCreate } from "./projectCreateSchema.js"
import type { ProjectArchiveState } from "./projectArchiveStateSchema.js"
import type { Project } from "./projectSchema.js"
import type { ProjectSettings } from "./projectSettingsSchema.js"
import type { ProjectSettingsUpdate } from "./projectSettingsUpdateSchema.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"

export type ProjectRepository = {
  projectsRead: (
    organizationId: string,
    zitadelProjectIds: readonly string[],
    organizationAdmin?: boolean,
    includeArchived?: boolean,
    projectAdministrator?: boolean,
  ) => Result<readonly ProjectListItem[]>
  projectRead: (projectIdentifier: string) => Result<Project | null>
  projectBindingRead: (projectIdentifier: string) => Result<ProjectBinding | null>
  environmentsRead: (projectId: string) => Result<readonly Environment[]>
  environmentRead: (projectId: string, environmentIdentifier: string) => Result<Environment | null>
  projectSettingsRead: (projectIdentifier: string) => Result<ProjectSettings | null>
  projectSettingsWrite: (projectIdentifier: string, input: ProjectSettingsUpdate) => Result<ProjectSettings | null>
  projectArchiveStateWrite?: (
    projectIdentifier: string,
    archiveState: ProjectArchiveState,
    expectedArchiveState?: ProjectArchiveState,
  ) => Result<Project | null>
  storageBindingsRead?: () => Result<readonly StorageBinding[]>
  projectCreate: (input: ProjectCreate, initialAdminSubjectId: string) => Result<ProjectCreateResult>
  organizationRead: (organizationId: string) => Result<Organization | null>
  projectGrantIdsRead?: (organizationId: string) => Result<readonly string[]>
}
