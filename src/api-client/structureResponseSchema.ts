import * as v from "valibot"

import { assetStructureFolderMembershipSchema } from "../structure/assetStructureFolderMembershipSchema.js"
import { structureFolderSchema } from "../structure/structureFolderSchema.js"

export const structureResponseSchema = v.strictObject({
  folders: v.array(structureFolderSchema),
  memberships: v.array(assetStructureFolderMembershipSchema),
})

export type StructureResponse = v.InferOutput<typeof structureResponseSchema>
