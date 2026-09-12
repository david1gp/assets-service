import type { Project } from "./projectSchema.js"

export type ProjectUnarchiveWorkflowResult = {
  project: Project
  createdBuckets: readonly string[]
  restoredOriginalCount: number
  regeneratedOutputCount: number
}
