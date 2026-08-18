import * as v from "valibot"

import { authenticatedPrincipalSchema } from "./authenticatedPrincipalSchema.js"

export const sessionSchema = v.strictObject({
  principal: authenticatedPrincipalSchema,
  createdAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
  expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
  rotateAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

export type AuthenticationSession = v.InferOutput<typeof sessionSchema>
