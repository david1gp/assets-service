import type { Database as BunDatabase } from "bun:sqlite"

import type { AssetDatabase } from "./assetDatabase.js"

export type DatabaseConnection = {
  client: BunDatabase
  db: AssetDatabase
  databasePath: string
}
