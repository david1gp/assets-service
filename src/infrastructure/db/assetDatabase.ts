import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"

import type { databaseSchema } from "./schema/databaseSchema.js"

export type AssetDatabase = BunSQLiteDatabase<typeof databaseSchema>
