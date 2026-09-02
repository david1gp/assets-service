import * as v from "valibot"

import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { environmentSchema } from "./environmentSchema.js"
import { organizationSchema } from "./organizationSchema.js"
import { projectSchema } from "./projectSchema.js"

const organizationInputSchema = v.strictObject({
  id: organizationSchema.entries.id,
  name: organizationSchema.entries.name,
  slug: organizationSchema.entries.slug,
})

const environmentBindingSchema = v.strictObject({
  name: environmentNameSchema,
  r2Bucket: environmentSchema.entries.r2Bucket,
  r2Prefix: environmentSchema.entries.r2Prefix,
  publicBaseUrl: environmentSchema.entries.publicBaseUrl,
})

export const projectCreateSchema = v.pipe(
  v.strictObject({
    organization: organizationInputSchema,
    name: projectSchema.entries.name,
    slug: projectSchema.entries.slug,
    defaultEnvironment: environmentNameSchema,
    binding: v.strictObject({
      zitadelProjectId: idSchema,
      serviceProjectId: idSchema,
    }),
    environments: v.pipe(v.array(environmentBindingSchema), v.length(2)),
  }),
  v.check(
    (input) =>
      new Set(input.environments.map((environment) => environment.name)).size === 2 &&
      input.environments.some((environment) => environment.name === "development") &&
      input.environments.some((environment) => environment.name === "production"),
    "Project creation requires exactly one development and production environment",
  ),
)

export type ProjectCreate = v.InferOutput<typeof projectCreateSchema>
