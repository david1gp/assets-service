import * as v from "valibot"

import { jobSchema } from "../workflow/jobSchema.js"
import { workflowSchema } from "../workflow/workflowSchema.js"

export const jobResponseSchema = v.strictObject({
  job: jobSchema,
  workflow: workflowSchema,
})

export type JobResponse = v.InferOutput<typeof jobResponseSchema>
