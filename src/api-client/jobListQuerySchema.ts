import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { jobKindSchema } from "../workflow/jobKindSchema.js"
import { jobStatusSchema } from "../workflow/jobStatusSchema.js"
import { pageQuerySchema } from "./pageQuerySchema.js"

export const jobListQuerySchema = v.strictObject({
  ...pageQuerySchema.entries,
  status: v.optional(jobStatusSchema),
  kind: v.optional(jobKindSchema),
  workflowId: v.optional(idSchema),
})

export type JobListQuery = v.InferOutput<typeof jobListQuerySchema>
