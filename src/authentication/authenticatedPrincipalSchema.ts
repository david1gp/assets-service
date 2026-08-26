import * as v from "valibot"

import { authenticationMethodSchema } from "./authenticationMethodSchema.js"
import { projectGrantSchema } from "./projectGrantSchema.js"

export const authenticatedPrincipalSchema = v.strictObject({
  subjectId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  organizationId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  organizationAdmin: v.optional(v.boolean(), false),
  method: authenticationMethodSchema,
  grants: v.array(projectGrantSchema),
  issuedAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
  expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

export type AuthenticatedPrincipal = v.InferOutput<typeof authenticatedPrincipalSchema>
