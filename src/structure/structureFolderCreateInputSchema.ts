import * as v from "valibot"

import { folderSegmentSchema } from "../asset/folderSegmentSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const structureFolderCreateInputSchema = v.strictObject({
  name: folderSegmentSchema,
  parentId: v.optional(v.nullable(idSchema)),
})

export type StructureFolderCreateInput = v.InferOutput<typeof structureFolderCreateInputSchema>
