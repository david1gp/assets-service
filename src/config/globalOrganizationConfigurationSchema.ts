import * as v from "valibot"

import { organizationDefinitionSchema } from "./organizationDefinitionSchema.js"

const directoryOrganizationSchema = v.picklist(["david", "contentoren"])

export const globalOrganizationConfigurationSchema = v.strictObject({
  organizations: v.strictObject({
    david: organizationDefinitionSchema,
    contentoren: organizationDefinitionSchema,
  }),
  directoryMappings: v.optional(v.record(v.pipe(v.string(), v.minLength(1)), directoryOrganizationSchema), {}),
})

export type GlobalOrganizationConfiguration = v.InferOutput<typeof globalOrganizationConfigurationSchema>
