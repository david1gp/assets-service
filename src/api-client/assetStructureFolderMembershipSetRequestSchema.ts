import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"

export const assetStructureFolderMembershipSetRequestSchema = v.strictObject({
  structureFolderId: v.nullable(idSchema),
})

export type AssetStructureFolderMembershipSetRequest = v.InferOutput<
  typeof assetStructureFolderMembershipSetRequestSchema
>
