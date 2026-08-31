import * as v from "valibot"

import { pageInfoSchema } from "./pageInfoSchema.js"
import { projectListItemSchema } from "./projectListItemSchema.js"

export const projectListResponseSchema = v.strictObject({
  projects: v.array(projectListItemSchema),
  page: pageInfoSchema,
})

export type ProjectListResponse = v.InferOutput<typeof projectListResponseSchema>
