import * as v from "valibot"

import { environmentResponseSchema } from "./environmentResponseSchema.js"
import { organizationSchema } from "../project/organizationSchema.js"
import { projectSchema } from "../project/projectSchema.js"
import { projectSettingsSchema } from "../project/projectSettingsSchema.js"
import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { idSchema } from "../schemas/idSchema.js"

const legacyProjectSchema = v.strictObject({
  id: projectSchema.entries.id,
  name: projectSchema.entries.name,
  defaultEnvironment: environmentNameSchema,
})

const legacyOrganizationSchema = v.strictObject({
  id: organizationSchema.entries.id,
  name: organizationSchema.entries.name,
  slug: organizationSchema.entries.slug,
})

const legacyBindingSchema = v.strictObject({
  serviceProjectId: idSchema,
  zitadelProjectId: idSchema,
})

const legacyProjectSettingsSchema = v.strictObject({
  project: legacyProjectSchema,
  organization: v.optional(v.nullable(legacyOrganizationSchema)),
  binding: legacyBindingSchema,
  environments: v.array(environmentResponseSchema),
})

/**
 * The canonical settings response is strict. The legacy branch is limited to
 * the established project-registration projection used by existing projects.
 */
export const projectSettingsResponseSchema = v.union([projectSettingsSchema, legacyProjectSettingsSchema])

export type ProjectSettingsResponse = v.InferOutput<typeof projectSettingsResponseSchema>
