import * as v from "valibot"

import { sessionOrganizationItemSchema } from "../authentication/sessionOrganizationItemSchema.js"

export const authOrganizationsResponseSchema = v.strictObject({
  organizations: v.array(sessionOrganizationItemSchema),
  currentOrganizationId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
})

export type AuthOrganizationsResponse = v.InferOutput<typeof authOrganizationsResponseSchema>
