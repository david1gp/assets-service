import type { Result } from "../schemas/resultSchema.js"
import type { Job } from "./jobSchema.js"
import type { Workflow } from "./workflowSchema.js"

type WorkflowPage = { items: readonly Workflow[]; nextCursor: number | null }
type JobPage = { items: readonly Job[]; nextCursor: number | null }
type WorkflowDetail = { workflow: Workflow; jobs: readonly Job[] }
type JobDetail = { job: Job; workflow: Workflow }
type WorkflowListOptions = {
  cursor?: number
  limit?: number
  status?: Workflow["status"]
  kind?: Workflow["kind"]
  assetId?: string
}
type JobListOptions = {
  cursor?: number
  limit?: number
  status?: Job["status"]
  kind?: Job["kind"]
  workflowId?: string
}

export type WorkflowApiRepository = {
  workflowsRead: (projectId: string, options: WorkflowListOptions) => Result<WorkflowPage>
  workflowRead: (projectId: string, workflowId: string) => Result<WorkflowDetail | null>
  jobsRead: (projectId: string, options: JobListOptions) => Result<JobPage>
  jobRead: (projectId: string, jobId: string) => Result<JobDetail | null>
  workflowRetry: (projectId: string, workflowId: string) => Result<WorkflowDetail | null>
  workflowCancel: (projectId: string, workflowId: string) => Result<WorkflowDetail | null>
  jobRetry: (projectId: string, jobId: string) => Result<JobDetail | null>
  jobCancel: (projectId: string, jobId: string) => Result<JobDetail | null>
}
