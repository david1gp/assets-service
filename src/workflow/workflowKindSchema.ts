import * as v from "valibot"

export const workflowKindSchema = v.picklist([
  "asset_processing",
  "catalog_generation",
  "deletion",
  "cleanup",
  "storage_migration",
])

export type WorkflowKind = v.InferOutput<typeof workflowKindSchema>
