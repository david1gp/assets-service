import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { workflowStatusSchema } from "./workflowStatusSchema.js"

export const workflowSchema = v.strictObject({
  id: idSchema,
  projectId: idSchema,
  assetId: v.optional(idSchema),
  kind: v.picklist(["asset_processing", "catalog_generation", "deletion", "cleanup"]),
  status: workflowStatusSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type Workflow = v.InferOutput<typeof workflowSchema>
