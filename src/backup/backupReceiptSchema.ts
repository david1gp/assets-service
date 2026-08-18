import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"

export const backupReceiptSchema = v.strictObject({
  id: idSchema,
  projectId: idSchema,
  sourceRevisionId: idSchema,
  jobId: idSchema,
  remotePath: v.pipe(v.string(), v.minLength(1)),
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  sha256: sha256Schema,
  checkResult: v.picklist(["verified", "failed"]),
  completedAt: isoDateSchema,
})

export type BackupReceipt = v.InferOutput<typeof backupReceiptSchema>
