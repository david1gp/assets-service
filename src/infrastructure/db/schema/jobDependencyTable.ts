import { sql } from "drizzle-orm"
import { sqliteTable, text, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import { jobTable } from "./jobTable.js"

export const jobDependencyTable = sqliteTable(
  "job_dependencies",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    dependsOnJobId: text("depends_on_job_id")
      .notNull()
      .references(() => jobTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("job_dependencies_pair_unique").on(table.jobId, table.dependsOnJobId),
    index("job_dependencies_dependency_index").on(table.dependsOnJobId),
    check("job_dependencies_not_self_check", sql`${table.jobId} <> ${table.dependsOnJobId}`),
  ],
)
