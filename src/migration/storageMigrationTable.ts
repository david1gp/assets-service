import { sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { projectTable } from "../infrastructure/db/schema/projectTable.js"
import type { StorageMigrationBindingSnapshot } from "./storageMigrationBindingSnapshotSchema.js"
import type { StorageMigrationProgress } from "./storageMigrationProgressSchema.js"

export const storageMigrationTable = sqliteTable(
  "storage_migrations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    environmentId: text("environment_id")
      .notNull()
      .references(() => environmentTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    attempt: integer("attempt").notNull().default(1),
    sourceBinding: text("source_binding", { mode: "json" }).$type<StorageMigrationBindingSnapshot>().notNull(),
    targetBinding: text("target_binding", { mode: "json" }).$type<StorageMigrationBindingSnapshot>().notNull(),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed", "cancelled"] }).notNull(),
    progress: text("progress", { mode: "json" }).$type<StorageMigrationProgress>().notNull(),
    sourceInventoryFingerprint: text("source_inventory_fingerprint"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("storage_migrations_environment_idempotency_attempt_unique").on(
      table.environmentId,
      table.idempotencyKey,
      table.attempt,
    ),
    uniqueIndex("storage_migrations_environment_active_unique")
      .on(table.environmentId)
      .where(sql`${table.status} IN ('queued', 'running')`),
    index("storage_migrations_project_status_index").on(table.projectId, table.status, table.updatedAt),
    index("storage_migrations_environment_index").on(table.environmentId, table.updatedAt),
    check(
      "storage_migrations_status_check",
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check("storage_migrations_source_binding_check", sql`json_valid(${table.sourceBinding})`),
    check("storage_migrations_target_binding_check", sql`json_valid(${table.targetBinding})`),
    check("storage_migrations_progress_check", sql`json_valid(${table.progress})`),
  ],
)
