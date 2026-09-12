import type { CloudflareRequestCredentials } from "../cloudflare/cloudflareRequestCredentialsSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ProjectArchiveWorkflowResult } from "./projectArchiveWorkflowResult.js"

export type ProjectArchiveWorkflow = {
  projectArchive: (
    projectIdentifier: string,
    cloudflareCredentials: CloudflareRequestCredentials,
  ) => Promise<Result<ProjectArchiveWorkflowResult>>
}
