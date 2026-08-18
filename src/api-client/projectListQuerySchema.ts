import * as v from "valibot"

import { pageQuerySchema } from "./pageQuerySchema.js"

export const projectListQuerySchema = v.strictObject({
  ...pageQuerySchema.entries,
  search: v.optional(v.pipe(v.string(), v.maxLength(255))),
})

export type ProjectListQuery = v.InferOutput<typeof projectListQuerySchema>
