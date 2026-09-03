import * as v from "valibot"

import { authenticatedPrincipalSchema } from "./authenticatedPrincipalSchema.js"
import { sessionPolicyVersionSchema } from "./sessionPolicyVersionSchema.js"

export const sessionSchema = v.strictObject({
  principal: authenticatedPrincipalSchema,
  createdAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
  expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
  rotateAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
  // Optional only so payloads from before policy versioning can be read and rejected at the request boundary.
  sessionPolicyVersion: v.optional(sessionPolicyVersionSchema),
})

export type AuthenticationSession = v.InferOutput<typeof sessionSchema>
