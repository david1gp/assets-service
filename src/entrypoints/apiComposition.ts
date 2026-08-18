import type { DatabaseConnection } from "../infrastructure/db/databaseConnection.js"
import type { ApiApplication } from "./apiApplication.js"

export type ApiComposition = {
  app: ApiApplication
  connection: DatabaseConnection
}
