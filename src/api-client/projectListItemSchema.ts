import * as v from "valibot"

import { projectSchema } from "../project/projectSchema.js"

export const projectListItemSchema = v.strictObject({
  ...projectSchema.entries,
  organizationSlug: v.pipe(v.string(), v.slug()),
  assetCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  totalFileSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export type ProjectListItem = v.InferOutput<typeof projectListItemSchema>
