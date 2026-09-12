import type { Result } from "../schemas/resultSchema.js"
import type { ProjectArchiveWorkflowResult } from "./projectArchiveWorkflowResult.js"

export type ProjectArchiveWorkflow = {
  projectArchive: (projectIdentifier: string) => Promise<Result<ProjectArchiveWorkflowResult>>
}
