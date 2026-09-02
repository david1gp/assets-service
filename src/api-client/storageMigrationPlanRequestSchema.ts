import * as v from "valibot"

import { storageMigrationTargetRequestSchema } from "./storageMigrationTargetRequestSchema.js"

export const storageMigrationPlanRequestSchema = v.strictObject({
  ...storageMigrationTargetRequestSchema.entries,
  idempotencyKey: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(256))),
})

export type StorageMigrationPlanRequest = v.InferOutput<typeof storageMigrationPlanRequestSchema>
