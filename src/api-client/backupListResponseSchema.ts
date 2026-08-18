import * as v from "valibot"

import { backupReceiptSchema } from "../backup/backupReceiptSchema.js"
import { pageInfoSchema } from "./pageInfoSchema.js"

export const backupListResponseSchema = v.strictObject({
  receipts: v.array(backupReceiptSchema),
  page: pageInfoSchema,
})

export type BackupListResponse = v.InferOutput<typeof backupListResponseSchema>
