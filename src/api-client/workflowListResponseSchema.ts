import * as v from "valibot"

import { pageInfoSchema } from "./pageInfoSchema.js"
import { workflowSchema } from "../workflow/workflowSchema.js"

export const workflowListResponseSchema = v.strictObject({
  workflows: v.array(workflowSchema),
  page: pageInfoSchema,
})

export type WorkflowListResponse = v.InferOutput<typeof workflowListResponseSchema>
