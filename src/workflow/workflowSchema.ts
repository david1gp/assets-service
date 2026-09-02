import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { workflowKindSchema } from "./workflowKindSchema.js"
import { workflowStatusSchema } from "./workflowStatusSchema.js"

export const workflowSchema = v.strictObject({
  id: idSchema,
  projectId: idSchema,
  assetId: v.optional(v.nullable(idSchema)),
  sourceRevisionId: v.optional(v.nullable(idSchema)),
  kind: workflowKindSchema,
  status: workflowStatusSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type Workflow = v.InferOutput<typeof workflowSchema>
