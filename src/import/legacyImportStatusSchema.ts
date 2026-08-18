import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { legacyImportConflictSchema } from "./legacyImportConflictSchema.js"

export const legacyImportStatusSchema = v.strictObject({
  id: idSchema,
  projectId: idSchema,
  status: v.picklist(["queued", "running", "succeeded", "failed", "cancelled"]),
  importedCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  conflicts: v.array(legacyImportConflictSchema),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  completedAt: v.nullable(isoDateSchema),
})

export type LegacyImportStatus = v.InferOutput<typeof legacyImportStatusSchema>
