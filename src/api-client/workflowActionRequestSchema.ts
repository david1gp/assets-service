import * as v from "valibot"

export const workflowActionRequestSchema = v.strictObject({
  reason: v.optional(v.pipe(v.string(), v.maxLength(1000))),
})

export type WorkflowActionRequest = v.InferOutput<typeof workflowActionRequestSchema>
