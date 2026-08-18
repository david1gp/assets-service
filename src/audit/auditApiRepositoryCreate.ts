import { and, asc, desc, eq } from "drizzle-orm"
import * as v from "valibot"

import type { AuditApiRepository } from "./auditApiRepository.js"
import { auditEventSchema } from "./auditEventSchema.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { auditEventTable } from "../infrastructure/db/schema/auditEventTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"

const pageLimitRead = (limit: number | undefined): number => Math.min(100, Math.max(1, limit ?? 50))

export const auditApiRepositoryCreate = (db: AssetDatabase): AuditApiRepository => {
  const eventRead = (record: typeof auditEventTable.$inferSelect) => {
    const parsed = v.safeParse(auditEventSchema, {
      ...record,
      ...(record.projectId === null ? {} : { projectId: record.projectId }),
      ...(record.details === null ? {} : { details: record.details }),
    })
    if (!parsed.success)
      return {
        success: false as const,
        op: "auditApiRepositoryEventRead",
        errorMessage: "The stored audit event was invalid",
      }
    return { success: true as const, data: parsed.output }
  }

  const auditEventsRead: AuditApiRepository["auditEventsRead"] = (projectId, options) => {
    try {
      const conditions = [eq(auditEventTable.projectId, projectId)]
      if (options.actorId !== undefined) conditions.push(eq(auditEventTable.actorId, options.actorId))
      if (options.action !== undefined) conditions.push(eq(auditEventTable.action, options.action))
      if (options.resourceType !== undefined) conditions.push(eq(auditEventTable.resourceType, options.resourceType))
      if (options.resourceId !== undefined) conditions.push(eq(auditEventTable.resourceId, options.resourceId))
      const rows = db
        .select()
        .from(auditEventTable)
        .where(and(...conditions))
        .orderBy(desc(auditEventTable.createdAt), asc(auditEventTable.id))
        .all()
      const offset = options.cursor ?? 0
      const limit = pageLimitRead(options.limit)
      const selected = rows.slice(offset, offset + limit + 1)
      const items = []
      for (const row of selected.slice(0, limit)) {
        const event = eventRead(row)
        if (!event.success) return event
        items.push(event.data)
      }
      return { success: true, data: { items, nextCursor: selected.length > limit ? offset + limit : null } }
    } catch (error) {
      return resultErrorCreate("auditApiRepositoryEventsRead", "The audit events could not be read", error)
    }
  }

  const auditEventRead: AuditApiRepository["auditEventRead"] = (projectId, eventId) => {
    try {
      const row = db
        .select()
        .from(auditEventTable)
        .where(and(eq(auditEventTable.projectId, projectId), eq(auditEventTable.id, eventId)))
        .get()
      if (row === undefined) return { success: true, data: null }
      return eventRead(row)
    } catch (error) {
      return resultErrorCreate("auditApiRepositoryEventRead", "The audit event could not be read", error)
    }
  }

  return { auditEventsRead, auditEventRead }
}
