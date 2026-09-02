import * as v from "valibot"

import { storageMigrationBindingSnapshotSchema } from "../migration/storageMigrationBindingSnapshotSchema.js"
import { storageMigrationStatusSchema } from "../migration/storageMigrationStatusSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const storageMigrationPlanResponseSchema = v.strictObject({
  sourceBinding: storageMigrationBindingSnapshotSchema,
  targetBinding: storageMigrationBindingSnapshotSchema,
  copyRequired: v.boolean(),
  idempotencyKey: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(256))),
  idempotency: v.strictObject({
    existingMigrationId: v.nullable(idSchema),
    existingMigrationStatus: v.nullable(storageMigrationStatusSchema),
    activeMigrationId: v.nullable(idSchema),
  }),
})

export type StorageMigrationPlanResponse = v.InferOutput<typeof storageMigrationPlanResponseSchema>
