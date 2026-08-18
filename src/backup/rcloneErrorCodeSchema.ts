import * as v from "valibot"

export const rcloneErrorCodeSchema = v.picklist([
  "cancelled",
  "command_failed",
  "command_unavailable",
  "copy_failed",
  "credential_missing",
  "invalid_request",
  "invalid_remote",
  "remote_unavailable",
  "source_missing",
  "source_mismatch",
  "timeout",
  "verification_failed",
])

export type RcloneErrorCode = v.InferOutput<typeof rcloneErrorCodeSchema>
