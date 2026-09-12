import * as v from "valibot"

import { sha256Schema } from "../schemas/sha256Schema.js"

export const rcloneBackupRestoreResultSchema = v.strictObject({
  destinationPath: v.pipe(v.string(), v.minLength(1)),
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  sha256: sha256Schema,
  checkResult: v.literal("verified"),
})

export type RcloneBackupRestoreResult = v.InferOutput<typeof rcloneBackupRestoreResultSchema>
