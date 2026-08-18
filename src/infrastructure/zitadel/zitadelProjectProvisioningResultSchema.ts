import * as v from "valibot"

import { authenticationRoleSchema } from "../../authentication/authenticationRoleSchema.js"
import { idSchema } from "../../schemas/idSchema.js"

export const zitadelProjectProvisioningResultSchema = v.strictObject({
  organizationId: idSchema,
  projectId: idSchema,
  applicationId: idSchema,
  roleKeys: v.pipe(v.array(authenticationRoleSchema), v.length(2)),
})

export type ZitadelProjectProvisioningResult = v.InferOutput<typeof zitadelProjectProvisioningResultSchema>
