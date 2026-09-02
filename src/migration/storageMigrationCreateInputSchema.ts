import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { storageMigrationBindingSnapshotSchema } from "./storageMigrationBindingSnapshotSchema.js"

export const storageMigrationCreateInputSchema = v.pipe(
  v.strictObject({
    projectId: idSchema,
    environmentId: idSchema,
    idempotencyKey: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
    sourceBinding: storageMigrationBindingSnapshotSchema,
    targetBinding: storageMigrationBindingSnapshotSchema,
  }),
  v.check(
    (input) =>
      input.sourceBinding.projectId === input.projectId &&
      input.targetBinding.projectId === input.projectId &&
      input.sourceBinding.environmentId === input.environmentId &&
      input.targetBinding.environmentId === input.environmentId &&
      input.sourceBinding.environment === input.targetBinding.environment,
    "Migration bindings must belong to the requested project and environment",
  ),
)

export type StorageMigrationCreateInput = v.InferOutput<typeof storageMigrationCreateInputSchema>
