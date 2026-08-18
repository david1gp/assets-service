import { sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { StructuredError } from "../../../api/structuredErrorSchema.js"
import type { JsonObject } from "../../../schemas/jsonObjectSchema.js"
import { workflowTable } from "./workflowTable.js"

export const jobTable = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflowTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    kind: text("kind", {
      enum: [
        "verify_original",
        "backup_original",
        "plan_outputs",
        "process_image_output",
        "copy_video_output",
        "process_font_output",
        "process_document_output",
        "publish_asset",
        "notify_customer_upload",
        "cleanup_local_files",
        "delete_asset",
      ],
    }).notNull(),
    status: text("status", { enum: ["queued", "running", "succeeded", "retryable", "dead", "cancelled"] }).notNull(),
    availableAt: text("available_at").notNull(),
    priority: integer("priority").notNull(),
    attempts: integer("attempts").notNull(),
    retryLimit: integer("retry_limit").notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: text("lease_expires_at"),
    heartbeatAt: text("heartbeat_at"),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadSchemaVersion: integer("payload_schema_version").notNull(),
    payload: text("payload", { mode: "json" }).$type<JsonObject>().notNull(),
    error: text("error", { mode: "json" }).$type<StructuredError>(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("jobs_idempotency_key_unique").on(table.idempotencyKey),
    index("jobs_claim_index").on(table.status, table.availableAt, table.priority),
    index("jobs_workflow_index").on(table.workflowId),
    check(
      "jobs_kind_check",
      sql`${table.kind} IN ('verify_original', 'backup_original', 'plan_outputs', 'process_image_output', 'copy_video_output', 'process_font_output', 'process_document_output', 'publish_asset', 'notify_customer_upload', 'cleanup_local_files', 'delete_asset')`,
    ),
    check(
      "jobs_status_check",
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'retryable', 'dead', 'cancelled')`,
    ),
    check("jobs_attempts_check", sql`${table.attempts} >= 0 AND ${table.retryLimit} >= 0`),
    check("jobs_payload_schema_version_check", sql`${table.payloadSchemaVersion} > 0`),
  ],
)
