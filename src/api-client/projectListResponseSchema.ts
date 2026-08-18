import * as v from "valibot"

import { pageInfoSchema } from "./pageInfoSchema.js"
import { projectSchema } from "../project/projectSchema.js"

export const projectListResponseSchema = v.strictObject({
  projects: v.array(projectSchema),
  page: pageInfoSchema,
})

export type ProjectListResponse = v.InferOutput<typeof projectListResponseSchema>
