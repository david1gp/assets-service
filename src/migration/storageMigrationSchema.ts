import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"
import { storageMigrationBindingSnapshotSchema } from "./storageMigrationBindingSnapshotSchema.js"
import { storageMigrationCreateInputSchema } from "./storageMigrationCreateInputSchema.js"
import { storageMigrationProgressSchema } from "./storageMigrationProgressSchema.js"
import { storageMigrationStatusSchema } from "./storageMigrationStatusSchema.js"

export const storageMigrationSchema = v.pipe(
  v.strictObject({
    id: idSchema,
    projectId: idSchema,
    environmentId: idSchema,
    idempotencyKey: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
    attempt: v.pipe(v.number(), v.integer(), v.minValue(1)),
    sourceBinding: storageMigrationBindingSnapshotSchema,
    targetBinding: storageMigrationBindingSnapshotSchema,
    status: storageMigrationStatusSchema,
    progress: storageMigrationProgressSchema,
    sourceInventoryFingerprint: v.nullable(sha256Schema),
    lastError: v.nullable(v.string()),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
    startedAt: v.nullable(isoDateSchema),
    completedAt: v.nullable(isoDateSchema),
  }),
  v.check((input) => {
    const parsed = v.safeParse(storageMigrationCreateInputSchema, {
      projectId: input.projectId,
      environmentId: input.environmentId,
      idempotencyKey: input.idempotencyKey,
      sourceBinding: input.sourceBinding,
      targetBinding: input.targetBinding,
    })
    return parsed.success
  }, "Migration bindings must belong to the requested project and environment"),
)

export type StorageMigration = v.InferOutput<typeof storageMigrationSchema>
