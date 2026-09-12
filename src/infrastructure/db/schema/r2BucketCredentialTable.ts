import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const r2BucketCredentialTable = sqliteTable(
  "r2_bucket_credentials",
  {
    bucket: text("bucket").primaryKey(),
    accessKeyIdCiphertext: text("access_key_id_ciphertext").notNull(),
    secretAccessKeyCiphertext: text("secret_access_key_ciphertext").notNull(),
    revocationId: text("revocation_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("r2_bucket_credentials_revocation_unique").on(table.revocationId)],
)
