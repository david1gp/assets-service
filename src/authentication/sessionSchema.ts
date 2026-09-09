import * as v from "valibot"

import { authenticatedPrincipalSchema } from "./authenticatedPrincipalSchema.js"
import { projectGrantSchema } from "./projectGrantSchema.js"
import { sessionPolicyVersionSchema } from "./sessionPolicyVersionSchema.js"

export const sessionSchema = v.strictObject({
  principal: authenticatedPrincipalSchema,
  createdAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
  expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
  rotateAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
  // Optional only so payloads from before policy versioning can be read and rejected at the request boundary.
  sessionPolicyVersion: v.optional(sessionPolicyVersionSchema),
  identityOrganizationId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(256))),
  accessTokenReference: v.optional(v.pipe(v.string(), v.minLength(1))),
  identityGrants: v.optional(v.array(projectGrantSchema)),
})

export type AuthenticationSession = v.InferOutput<typeof sessionSchema>
