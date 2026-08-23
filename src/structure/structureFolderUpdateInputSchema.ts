import * as v from "valibot"

import { folderSegmentSchema } from "../asset/folderSegmentSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const structureFolderUpdateInputSchema = v.strictObject({
  name: v.optional(folderSegmentSchema),
  parentId: v.optional(v.nullable(idSchema)),
})

export type StructureFolderUpdateInput = v.InferOutput<typeof structureFolderUpdateInputSchema>
