import * as v from "valibot"

const outputVersionReuseDecisionSchema = v.strictObject({
  kind: v.literal("reuse"),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

const outputVersionAllocateDecisionSchema = v.strictObject({
  kind: v.literal("allocate"),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

const outputVersionCollisionDecisionSchema = v.strictObject({
  kind: v.literal("collision"),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

export const outputVersionDecisionSchema = v.variant("kind", [
  outputVersionReuseDecisionSchema,
  outputVersionAllocateDecisionSchema,
  outputVersionCollisionDecisionSchema,
])

export type OutputVersionDecision = v.InferOutput<typeof outputVersionDecisionSchema>
