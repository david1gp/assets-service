import * as v from "valibot"

import { projectSchema } from "../project/projectSchema.js"

export const projectUnarchiveResponseSchema = v.strictObject({
  project: projectSchema,
  createdBuckets: v.array(v.pipe(v.string(), v.minLength(1))),
  restoredOriginalCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  regeneratedOutputCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export type ProjectUnarchiveResponse = v.InferOutput<typeof projectUnarchiveResponseSchema>
