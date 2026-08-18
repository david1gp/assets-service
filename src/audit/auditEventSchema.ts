import * as v from "valibot"

import { jsonObjectSchema } from "../schemas/jsonObjectSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const auditEventSchema = v.strictObject({
  id: idSchema,
  organizationId: idSchema,
  projectId: v.optional(idSchema),
  actorId: v.pipe(v.string(), v.minLength(1)),
  action: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  resourceType: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  resourceId: idSchema,
  details: v.optional(jsonObjectSchema),
  createdAt: isoDateSchema,
})

export type AuditEvent = v.InferOutput<typeof auditEventSchema>
