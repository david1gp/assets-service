import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"

const reconciliationPlanItemSchema = v.strictObject({
  id: idSchema,
  bucket: v.nullable(v.pipe(v.string(), v.minLength(1))),
  objectKey: v.pipe(v.string(), v.minLength(1)),
  kind: v.picklist(["staging", "private", "public", "stalled"]),
  action: v.picklist(["delete", "retain", "recover"]),
  reason: v.pipe(v.string(), v.minLength(1)),
  ownershipRecordId: v.nullable(idSchema),
  ownershipVerified: v.boolean(),
  lastModified: v.nullable(isoDateSchema),
})

export const reconciliationPlanSchema = v.strictObject({
  schema: v.literal("assets.reconciliation-plan.v1"),
  id: idSchema,
  generatedAt: isoDateSchema,
  dryRun: v.literal(true),
  requiresVerifiedBackup: v.literal(true),
  items: v.array(reconciliationPlanItemSchema),
})

export type ReconciliationPlanItem = v.InferOutput<typeof reconciliationPlanItemSchema>
export type ReconciliationPlan = v.InferOutput<typeof reconciliationPlanSchema>
