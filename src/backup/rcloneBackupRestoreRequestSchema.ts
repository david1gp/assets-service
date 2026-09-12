import * as v from "valibot"

import { sha256Schema } from "../schemas/sha256Schema.js"

export const rcloneBackupRestoreRequestSchema = v.strictObject({
  remotePath: v.pipe(v.string(), v.minLength(1)),
  destinationPath: v.pipe(v.string(), v.minLength(1)),
  expectedByteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  expectedSha256: sha256Schema,
  timeoutMs: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
})

export type RcloneBackupRestoreRequest = v.InferOutput<typeof rcloneBackupRestoreRequestSchema>
