import * as v from "valibot"

import { environmentNameSchema } from "../schemas/environmentNameSchema.js"

export const legacyImportRequestSchema = v.strictObject({
  root: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
  environment: v.optional(environmentNameSchema),
  atomicity: v.optional(v.picklist(["all_or_nothing", "best_effort"])),
  showAiLabel: v.optional(v.boolean()),
})

export type LegacyImportRequest = v.InferOutput<typeof legacyImportRequestSchema>
