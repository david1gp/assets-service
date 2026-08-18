import * as v from "valibot"

import { environmentSchema } from "./environmentSchema.js"
import { organizationSchema } from "./organizationSchema.js"
import { projectBindingSchema } from "./projectBindingSchema.js"
import { projectSchema } from "./projectSchema.js"

export const projectSettingsSchema = v.strictObject({
  project: projectSchema,
  organization: v.nullable(organizationSchema),
  binding: v.nullable(projectBindingSchema),
  environments: v.array(environmentSchema),
})

export type ProjectSettings = v.InferOutput<typeof projectSettingsSchema>
