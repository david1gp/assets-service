import * as v from "valibot"

import { projectSettingsSchema } from "./projectSettingsSchema.js"

export const projectCreateResultSchema = v.strictObject({
  project: projectSettingsSchema,
  created: v.boolean(),
})

export type ProjectCreateResult = v.InferOutput<typeof projectCreateResultSchema>
