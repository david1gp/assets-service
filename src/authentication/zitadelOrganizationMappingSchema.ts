import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"

export const zitadelOrganizationMappingSchema = v.pipe(
  v.strictObject({
    ownerOrganizationId: idSchema,
    customerOrganizationId: v.optional(v.nullable(idSchema)),
  }),
  v.transform((mapping) => ({
    ownerOrganizationId: mapping.ownerOrganizationId,
    ...(mapping.customerOrganizationId ? { customerOrganizationId: mapping.customerOrganizationId } : {}),
  })),
)

export type ZitadelOrganizationMapping = v.InferOutput<typeof zitadelOrganizationMappingSchema>
