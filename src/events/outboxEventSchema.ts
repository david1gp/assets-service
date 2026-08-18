import * as v from "valibot"

import { jsonObjectSchema } from "../schemas/jsonObjectSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const outboxEventSchema = v.strictObject({
  id: idSchema,
  eventId: v.pipe(v.string(), v.minLength(1)),
  kind: v.picklist(["customer_asset_uploaded", "audit_event"]),
  payload: jsonObjectSchema,
  status: v.picklist(["pending", "processing", "sent", "dead", "delivered", "failed"]),
  attempts: v.pipe(v.number(), v.integer(), v.minValue(0)),
  availableAt: isoDateSchema,
  deliveredAt: v.nullable(isoDateSchema),
  lastError: v.nullable(v.string()),
  createdAt: isoDateSchema,
  leaseOwner: v.optional(v.nullable(v.string())),
  leaseExpiresAt: v.optional(v.nullable(isoDateSchema)),
})

export type OutboxEvent = v.InferOutput<typeof outboxEventSchema>
