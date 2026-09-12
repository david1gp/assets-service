import type { CloudflareRequestCredentials } from "../cloudflare/cloudflareRequestCredentialsSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ProjectUnarchiveWorkflowResult } from "./projectUnarchiveWorkflowResult.js"

export type ProjectUnarchiveWorkflow = {
  projectUnarchive: (
    projectIdentifier: string,
    cloudflareCredentials: CloudflareRequestCredentials,
  ) => Promise<Result<ProjectUnarchiveWorkflowResult>>
}
