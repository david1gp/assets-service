import * as v from "valibot"

import { pageQuerySchema } from "./pageQuerySchema.js"

const includeArchivedQuerySchema = v.pipe(
  v.picklist(["true", "false"]),
  v.transform((value) => value === "true"),
)

export const projectListQuerySchema = v.strictObject({
  ...pageQuerySchema.entries,
  search: v.optional(v.pipe(v.string(), v.maxLength(255))),
  includeArchived: v.optional(includeArchivedQuerySchema),
})

export type ProjectListQuery = v.InferOutput<typeof projectListQuerySchema>
