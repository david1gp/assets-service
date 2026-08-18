import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const jobDependencySchema = v.strictObject({
  id: idSchema,
  jobId: idSchema,
  dependsOnJobId: idSchema,
  createdAt: isoDateSchema,
})

export type JobDependency = v.InferOutput<typeof jobDependencySchema>
