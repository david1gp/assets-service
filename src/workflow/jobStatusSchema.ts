import * as v from "valibot"

export const jobStatusSchema = v.picklist(["queued", "running", "succeeded", "retryable", "dead", "cancelled"])

export type JobStatus = v.InferOutput<typeof jobStatusSchema>
