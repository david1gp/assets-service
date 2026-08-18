import * as v from "valibot"

import { jobSchema } from "../workflow/jobSchema.js"
import { workflowSchema } from "../workflow/workflowSchema.js"

export const workflowResponseSchema = v.strictObject({
  workflow: workflowSchema,
  jobs: v.array(jobSchema),
})

export type WorkflowResponse = v.InferOutput<typeof workflowResponseSchema>
