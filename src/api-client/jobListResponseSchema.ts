import * as v from "valibot"

import { jobSchema } from "../workflow/jobSchema.js"
import { pageInfoSchema } from "./pageInfoSchema.js"

export const jobListResponseSchema = v.strictObject({
  jobs: v.array(jobSchema),
  page: pageInfoSchema,
})

export type JobListResponse = v.InferOutput<typeof jobListResponseSchema>
