import * as v from "valibot"

export const errorCodeSchema = v.picklist([
  "validation_failed",
  "not_configured",
  "unauthorized",
  "forbidden",
  "not_found",
  "method_not_allowed",
  "service_unavailable",
  "conflict",
  "upstream_failure",
  "job_failed",
  "internal_error",
])

export type ErrorCode = v.InferOutput<typeof errorCodeSchema>
