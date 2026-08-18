import * as v from "valibot"

import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { environmentSchema } from "./environmentSchema.js"
import { projectSchema } from "./projectSchema.js"

const environmentBindingSchema = v.strictObject({
  name: environmentNameSchema,
  r2Bucket: environmentSchema.entries.r2Bucket,
  r2Prefix: environmentSchema.entries.r2Prefix,
  publicBaseUrl: environmentSchema.entries.publicBaseUrl,
})

/**
 * Editable part of a project: its identity, the Zitadel/service binding, and one
 * storage binding per environment. The whole document is written at once so a
 * half-applied binding can never be persisted.
 */
export const projectSettingsUpdateSchema = v.pipe(
  v.strictObject({
    name: projectSchema.entries.name,
    defaultEnvironment: environmentNameSchema,
    binding: v.strictObject({
      zitadelProjectId: idSchema,
      serviceProjectId: idSchema,
    }),
    environments: v.pipe(v.array(environmentBindingSchema), v.minLength(1), v.maxLength(2)),
  }),
  v.check(
    (input) => new Set(input.environments.map((environment) => environment.name)).size === input.environments.length,
    "Each environment may be configured only once",
  ),
  v.check(
    (input) => input.environments.some((environment) => environment.name === input.defaultEnvironment),
    "The default environment must be configured",
  ),
)

export type ProjectSettingsUpdate = v.InferOutput<typeof projectSettingsUpdateSchema>
