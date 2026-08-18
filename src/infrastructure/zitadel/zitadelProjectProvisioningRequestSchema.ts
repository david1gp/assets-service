import * as v from "valibot"

import { idSchema } from "../../schemas/idSchema.js"
import { zitadelGrantRequestSchema } from "./zitadelGrantRequestSchema.js"

export const zitadelProjectProvisioningRequestSchema = v.strictObject({
  organizationId: idSchema,
  projectId: idSchema,
  serviceProjectId: idSchema,
  clientId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  redirectUris: v.pipe(v.array(v.pipe(v.string(), v.url())), v.minLength(1)),
  postLogoutRedirectUris: v.pipe(v.array(v.pipe(v.string(), v.url())), v.minLength(1)),
  grantRequests: v.optional(v.array(zitadelGrantRequestSchema)),
})

export type ZitadelProjectProvisioningRequest = v.InferOutput<typeof zitadelProjectProvisioningRequestSchema>
