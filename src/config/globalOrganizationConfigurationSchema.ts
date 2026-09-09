import * as v from "valibot"

import { organizationDefinitionSchema } from "./organizationDefinitionSchema.js"

const organizationAliasSchema = v.pipe(v.string(), v.minLength(1))

export const globalOrganizationConfigurationSchema = v.pipe(
  v.strictObject({
    organizations: v.pipe(
      v.record(organizationAliasSchema, organizationDefinitionSchema),
      v.check((organizations) => Object.keys(organizations).length > 0, "At least one organization must be configured"),
    ),
    directoryMappings: v.optional(v.record(v.pipe(v.string(), v.minLength(1)), organizationAliasSchema), {}),
  }),
  v.check(
    (config) => Object.values(config.directoryMappings).every((alias) => Object.hasOwn(config.organizations, alias)),
    "The directory mapping organization must be configured in organizations",
  ),
)

export type GlobalOrganizationConfiguration = v.InferOutput<typeof globalOrganizationConfigurationSchema>
