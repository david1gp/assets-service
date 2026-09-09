import * as v from "valibot"

import { authenticatedPrincipalSchema } from "../authentication/authenticatedPrincipalSchema.js"

export const authOrganizationSwitchResponseSchema = v.strictObject({
  switched: v.boolean(),
  organizationId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  principal: authenticatedPrincipalSchema,
})

export type AuthOrganizationSwitchResponse = v.InferOutput<typeof authOrganizationSwitchResponseSchema>
