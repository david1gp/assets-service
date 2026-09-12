import type { Result } from "../schemas/resultSchema.js"
import type { ProjectUnarchiveWorkflowResult } from "./projectUnarchiveWorkflowResult.js"

export type ProjectUnarchiveWorkflow = {
  projectUnarchive: (projectIdentifier: string) => Promise<Result<ProjectUnarchiveWorkflowResult>>
}
