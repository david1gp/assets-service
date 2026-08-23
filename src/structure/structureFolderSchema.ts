import * as v from "valibot"

import { folderSegmentSchema } from "../asset/folderSegmentSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"

const structureFolderDepthSchema = v.union([v.literal(1), v.literal(2), v.literal(3)])

export const structureFolderSchema = v.strictObject({
  id: idSchema,
  projectId: idSchema,
  parentId: v.nullable(idSchema),
  name: folderSegmentSchema,
  depth: structureFolderDepthSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type StructureFolder = v.InferOutput<typeof structureFolderSchema>
