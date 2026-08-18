import type { StructuredError } from "../api/structuredErrorSchema.js"

export const jobErrorCreate = (message: string, retryable: boolean): StructuredError => ({
  code: "job_failed",
  message: message.length > 0 ? message : "The job failed",
  retryable,
})
