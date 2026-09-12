import type { AnySQLiteTable } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { AssetDatabase } from "./assetDatabase.js"

const projectLegacyRecordInsert = <TTable extends AnySQLiteTable>(
  db: AssetDatabase,
  table: TTable,
  values: InferInsertModel<TTable>,
): InferSelectModel<TTable> | null => {
  const input = values as unknown as Record<string, unknown>
  if (input.archiveState !== undefined || input.id === undefined) return null
  const columns = [
    ["id", "id"],
    ["organizationId", "organization_id"],
    ["name", "name"],
    ["slug", "slug"],
    ["defaultEnvironment", "default_environment"],
    ["createdAt", "created_at"],
    ["updatedAt", "updated_at"],
  ] as const
  const present = columns.filter(([key]) => input[key] !== undefined)
  if (present.length === 0) return null
  db.run(
    sql`INSERT INTO "projects" (${sql.join(
      present.map(([, column]) => sql.identifier(column)),
      sql`, `,
    )}) VALUES (${sql.join(
      present.map(([key]) => sql`${input[key]}`),
      sql`, `,
    )})`,
  )
  const inserted = db.select().from(table).where(sql`"id" = ${input.id}`).limit(1).get()
  return (inserted as InferSelectModel<TTable> | undefined) ?? null
}

export const databaseRecordInsert = <TTable extends AnySQLiteTable>(
  db: AssetDatabase,
  table: TTable,
  values: InferInsertModel<TTable>,
): Result<InferSelectModel<TTable>> => {
  const op = "databaseRecordInsert"

  try {
    const record = db
      .insert(table)
      .values(values as never)
      .returning()
      .get()
    return { success: true, data: record as InferSelectModel<TTable> }
  } catch (error) {
    if (error instanceof Error && /table projects has no column named archive_state/i.test(error.message)) {
      try {
        const legacyRecord = projectLegacyRecordInsert(db, table, values)
        if (legacyRecord !== null) return { success: true, data: legacyRecord }
      } catch (legacyError) {
        return resultErrorCreate(op, legacyError instanceof Error ? legacyError.message : String(legacyError))
      }
    }
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}
