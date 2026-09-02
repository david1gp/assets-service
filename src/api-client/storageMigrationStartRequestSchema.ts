import * as v from "valibot"

import { storageMigrationBindingSnapshotSchema } from "../migration/storageMigrationBindingSnapshotSchema.js"
import { storageMigrationTargetRequestSchema } from "./storageMigrationTargetRequestSchema.js"

export const storageMigrationStartRequestSchema = v.strictObject({
  ...storageMigrationTargetRequestSchema.entries,
  idempotencyKey: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  sourceBinding: storageMigrationBindingSnapshotSchema,
  targetBinding: v.optional(storageMigrationBindingSnapshotSchema),
})

export type StorageMigrationStartRequest = v.InferOutput<typeof storageMigrationStartRequestSchema>
