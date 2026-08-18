import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"

export const rcloneBackupResultSchema = v.strictObject({
  remotePath: v.pipe(v.string(), v.minLength(1)),
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  sha256: sha256Schema,
  checkResult: v.literal("verified"),
  completedAt: isoDateSchema,
  commandMode: v.literal("copyto"),
})

export type RcloneBackupResult = v.InferOutput<typeof rcloneBackupResultSchema>
