import * as v from "valibot"

import { authenticationRoleSchema } from "../../authentication/authenticationRoleSchema.js"
import { idSchema } from "../../schemas/idSchema.js"

export const zitadelGrantRequestSchema = v.strictObject({
  organizationId: idSchema,
  projectId: idSchema,
  subjectId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  subjectType: v.picklist(["user", "service_account"]),
  roles: v.pipe(
    v.array(authenticationRoleSchema),
    v.minLength(1),
    v.check((roles) => new Set(roles).size === roles.length),
  ),
})

export type ZitadelGrantRequest = v.InferOutput<typeof zitadelGrantRequestSchema>
