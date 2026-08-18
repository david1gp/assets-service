import * as v from "valibot"

import { assetClassSchema } from "../schemas/assetClassSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { assetBasenameSchema } from "./assetBasenameSchema.js"
import { foldersSchema } from "./foldersSchema.js"

export const assetIdentitySchema = v.strictObject({
  projectId: idSchema,
  class: assetClassSchema,
  folders: foldersSchema,
  basename: assetBasenameSchema,
})

export type AssetIdentity = v.InferOutput<typeof assetIdentitySchema>
