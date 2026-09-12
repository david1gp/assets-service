import * as v from "valibot"

import { projectSchema } from "../project/projectSchema.js"

export const projectArchiveResponseSchema = v.strictObject({
  project: projectSchema,
  deletedBuckets: v.array(v.pipe(v.string(), v.minLength(1))),
  deletedObjectCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export type ProjectArchiveResponse = v.InferOutput<typeof projectArchiveResponseSchema>
