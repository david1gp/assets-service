import * as v from "valibot"

import { auditEventSchema } from "../audit/auditEventSchema.js"
import { pageInfoSchema } from "./pageInfoSchema.js"

export const auditEventListResponseSchema = v.strictObject({
  events: v.array(auditEventSchema),
  page: pageInfoSchema,
})

export type AuditEventListResponse = v.InferOutput<typeof auditEventListResponseSchema>
