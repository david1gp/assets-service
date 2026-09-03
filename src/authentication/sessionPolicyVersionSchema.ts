import * as v from "valibot"

export const sessionPolicyVersionSchema = v.pipe(v.number(), v.integer(), v.minValue(1))

export type SessionPolicyVersion = v.InferOutput<typeof sessionPolicyVersionSchema>
