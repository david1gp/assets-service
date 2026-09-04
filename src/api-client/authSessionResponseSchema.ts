import * as v from "valibot"

import { authenticatedPrincipalSchema } from "../authentication/authenticatedPrincipalSchema.js"

export const authSessionResponseSchema = v.strictObject({
  authenticated: v.boolean(),
  principal: v.nullable(authenticatedPrincipalSchema),
})

export type AuthSessionResponse = v.InferOutput<typeof authSessionResponseSchema>
