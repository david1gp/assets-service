import * as v from "valibot"

export const organizationSwitchRequestSchema = v.strictObject({
  organizationId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
})

export type OrganizationSwitchRequest = v.InferOutput<typeof organizationSwitchRequestSchema>
