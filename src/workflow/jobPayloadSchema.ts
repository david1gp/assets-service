import * as v from "valibot"
import { idSchema } from "../schemas/idSchema.js"
import { jsonObjectSchema } from "../schemas/jsonObjectSchema.js"

export const jobPayloadSchema = v.strictObject({
  assetId: v.optional(idSchema),
  sourceRevisionId: v.optional(idSchema),
  outputDefinitionId: v.optional(idSchema),
  uploadId: v.optional(idSchema),
  environmentId: v.optional(idSchema),
  deletionId: v.optional(idSchema),
  legacyImportId: v.optional(idSchema),
  values: v.optional(jsonObjectSchema),
})

export type JobPayload = v.InferOutput<typeof jobPayloadSchema>
