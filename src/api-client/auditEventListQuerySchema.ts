import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { pageQuerySchema } from "./pageQuerySchema.js"

export const auditEventListQuerySchema = v.strictObject({
  ...pageQuerySchema.entries,
  actorId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(255))),
  action: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(128))),
  resourceType: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(128))),
  resourceId: v.optional(idSchema),
})

export type AuditEventListQuery = v.InferOutput<typeof auditEventListQuerySchema>
