import type { Result } from "../schemas/resultSchema.js"
import type { Environment } from "./environmentSchema.js"
import type { Organization } from "./organizationSchema.js"
import type { ProjectBinding } from "./projectBindingSchema.js"
import type { Project } from "./projectSchema.js"
import type { ProjectSettings } from "./projectSettingsSchema.js"
import type { ProjectSettingsUpdate } from "./projectSettingsUpdateSchema.js"

export type ProjectRepository = {
  projectsRead: (
    organizationId: string,
    zitadelProjectIds: readonly string[],
    organizationAdmin?: boolean,
  ) => Result<readonly Project[]>
  projectRead: (projectIdentifier: string) => Result<Project | null>
  projectBindingRead: (projectIdentifier: string) => Result<ProjectBinding | null>
  environmentsRead: (projectId: string) => Result<readonly Environment[]>
  environmentRead: (projectId: string, environmentIdentifier: string) => Result<Environment | null>
  projectSettingsRead: (projectIdentifier: string) => Result<ProjectSettings | null>
  projectSettingsWrite: (projectIdentifier: string, input: ProjectSettingsUpdate) => Result<ProjectSettings | null>
  organizationRead: (organizationId: string) => Result<Organization | null>
}
