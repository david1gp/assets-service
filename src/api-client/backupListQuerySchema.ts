import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { pageQuerySchema } from "./pageQuerySchema.js"

export const backupListQuerySchema = v.strictObject({
  ...pageQuerySchema.entries,
  sourceRevisionId: v.optional(idSchema),
  assetId: v.optional(idSchema),
  checkResult: v.optional(v.picklist(["verified", "failed"])),
})

export type BackupListQuery = v.InferOutput<typeof backupListQuerySchema>
