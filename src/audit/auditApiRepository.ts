import type { AuditEvent } from "./auditEventSchema.js"
import type { Result } from "../schemas/resultSchema.js"

type AuditListOptions = {
  cursor?: number
  limit?: number
  actorId?: string
  action?: string
  resourceType?: string
  resourceId?: string
}
type AuditPage = { items: readonly AuditEvent[]; nextCursor: number | null }

export type AuditApiRepository = {
  auditEventsRead: (projectId: string, options: AuditListOptions) => Result<AuditPage>
  auditEventRead: (projectId: string, eventId: string) => Result<AuditEvent | null>
}
