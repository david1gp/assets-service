import * as v from "valibot"

const nonNegativeIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(0))

const membershipLookupDiagnosticsSchema = v.strictObject({
  requestedOrganizationId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  httpStatus: v.pipe(v.number(), v.integer(), v.minValue(100), v.maxValue(599)),
  resultCount: nonNegativeIntegerSchema,
  scopeCounts: v.strictObject({
    iam: nonNegativeIntegerSchema,
    orgId: nonNegativeIntegerSchema,
    projectId: nonNegativeIntegerSchema,
    projectGrantId: nonNegativeIntegerSchema,
  }),
  exactMatchCount: nonNegativeIntegerSchema,
})

export const zitadelOrganizationMembershipSchema = v.strictObject({
  isExactMember: v.boolean(),
  isOrganizationAdmin: v.boolean(),
  displayName: v.optional(v.string()),
  diagnostics: v.optional(membershipLookupDiagnosticsSchema),
})

export type ZitadelOrganizationMembership = v.InferOutput<typeof zitadelOrganizationMembershipSchema>
