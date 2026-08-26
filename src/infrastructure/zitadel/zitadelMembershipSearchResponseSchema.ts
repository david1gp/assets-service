import * as v from "valibot"

const membershipIdentifierSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(256))
const membershipRoleSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(256))

const membershipSchema = v.pipe(
  v.strictObject({
    userId: v.optional(membershipIdentifierSchema),
    details: v.optional(v.record(v.string(), v.unknown())),
    roles: v.pipe(v.array(membershipRoleSchema), v.minLength(1)),
    displayName: v.optional(v.string()),
    iam: v.optional(v.boolean()),
    orgId: v.optional(membershipIdentifierSchema),
    projectId: v.optional(membershipIdentifierSchema),
    projectGrantId: v.optional(membershipIdentifierSchema),
  }),
  v.check(
    (membership) =>
      [membership.iam, membership.orgId, membership.projectId, membership.projectGrantId].filter(
        (scope) => scope !== undefined,
      ).length === 1,
  ),
)

export const zitadelMembershipSearchResponseSchema = v.strictObject({
  details: v.optional(v.record(v.string(), v.unknown())),
  result: v.array(membershipSchema),
})
