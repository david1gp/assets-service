import * as v from "valibot"

export const workflowStatusSchema = v.picklist(["queued", "running", "succeeded", "failed", "cancelled"])

export type WorkflowStatus = v.InferOutput<typeof workflowStatusSchema>
