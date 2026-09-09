import * as v from "valibot"

import { authenticationModeSchema } from "./authenticationModeSchema.js"

export const sessionOrganizationItemSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  current: v.boolean(),
  mode: authenticationModeSchema,
  organizationAdmin: v.boolean(),
})

export type SessionOrganizationItem = v.InferOutput<typeof sessionOrganizationItemSchema>

export const sessionOrganizationsReadResponseSchema = v.strictObject({
  organizations: v.array(sessionOrganizationItemSchema),
  currentOrganizationId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
})

export type SessionOrganizationsReadResponse = v.InferOutput<typeof sessionOrganizationsReadResponseSchema>
