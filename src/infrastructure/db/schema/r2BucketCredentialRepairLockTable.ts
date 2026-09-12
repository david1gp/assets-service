import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const r2BucketCredentialRepairLockTable = sqliteTable("r2_bucket_credential_repair_locks", {
  bucket: text("bucket").primaryKey(),
  ownerId: text("owner_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
})
