import * as v from "valibot"

export const zitadelOrganizationMembershipSchema = v.strictObject({
  isExactMember: v.boolean(),
  isOrganizationAdmin: v.boolean(),
})

export type ZitadelOrganizationMembership = v.InferOutput<typeof zitadelOrganizationMembershipSchema>
