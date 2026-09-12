import type { Project } from "./projectSchema.js"

export type ProjectArchiveWorkflowResult = {
  project: Project
  deletedBuckets: readonly string[]
  deletedObjectCount: number
}
