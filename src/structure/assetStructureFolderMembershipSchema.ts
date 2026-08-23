import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"

export const assetStructureFolderMembershipSchema = v.strictObject({
  id: idSchema,
  assetId: idSchema,
  structureFolderId: idSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type AssetStructureFolderMembership = v.InferOutput<typeof assetStructureFolderMembershipSchema>
