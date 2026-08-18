import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { backupReceiptSchema } from "./backupReceiptSchema.js"

export const backupStatusSchema = v.strictObject({
  sourceRevisionId: idSchema,
  status: v.picklist(["pending", "verified", "failed"]),
  receipt: v.nullable(backupReceiptSchema),
})

export type BackupStatus = v.InferOutput<typeof backupStatusSchema>
