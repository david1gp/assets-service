import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { storageMigrationSchema } from "../migration/storageMigrationSchema.js"

export const storageMigrationStartResponseSchema = v.strictObject({
  accepted: v.literal(true),
  migrationId: idSchema,
  workflowId: idSchema,
  migration: storageMigrationSchema,
})

export type StorageMigrationStartResponse = v.InferOutput<typeof storageMigrationStartResponseSchema>
