import * as v from "valibot"

import { pageQuerySchema } from "./pageQuerySchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { workflowStatusSchema } from "../workflow/workflowStatusSchema.js"

export const workflowListQuerySchema = v.strictObject({
  ...pageQuerySchema.entries,
  status: v.optional(workflowStatusSchema),
  kind: v.optional(v.picklist(["asset_processing", "catalog_generation", "deletion", "cleanup"])),
  assetId: v.optional(idSchema),
})

export type WorkflowListQuery = v.InferOutput<typeof workflowListQuerySchema>
