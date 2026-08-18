import * as v from "valibot"

import { assetClassSchema } from "../schemas/assetClassSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { assetBasenameSchema } from "./assetBasenameSchema.js"
import { assetFilenameSchema } from "./assetFilenameSchema.js"
import { foldersSchema } from "./foldersSchema.js"

export const assetSchema = v.strictObject({
  id: idSchema,
  projectId: idSchema,
  class: assetClassSchema,
  folders: foldersSchema,
  filename: assetFilenameSchema,
  basename: assetBasenameSchema,
  currentSourceRevisionId: idSchema,
  integrationNote: v.optional(v.pipe(v.string(), v.maxLength(10000))),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type Asset = v.InferOutput<typeof assetSchema>
