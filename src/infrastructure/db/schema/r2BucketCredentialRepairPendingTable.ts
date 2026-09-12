import { sqliteTable, text } from "drizzle-orm/sqlite-core"

export const r2BucketCredentialRepairPendingTable = sqliteTable("r2_bucket_credential_repair_pending", {
  bucket: text("bucket").primaryKey(),
  previousAccessKeyIdCiphertext: text("previous_access_key_id_ciphertext").notNull(),
  previousSecretAccessKeyCiphertext: text("previous_secret_access_key_ciphertext").notNull(),
  previousRevocationId: text("previous_revocation_id"),
  previousCreatedAt: text("previous_created_at").notNull(),
  previousUpdatedAt: text("previous_updated_at").notNull(),
  replacementRevocationId: text("replacement_revocation_id").notNull(),
})
