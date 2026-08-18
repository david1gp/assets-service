import { serviceConfigRead } from "../config/serviceConfigRead.js"
import { databaseClose } from "../infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../infrastructure/db/databaseOpen.js"

export const databaseMigrateMain = (): number => {
  const config = serviceConfigRead()
  if (!config.success) return operationFailure(config.errorMessage)

  const opened = databaseOpen(config.data.databasePath)
  if (!opened.success) return operationFailure(opened.errorMessage)

  const migrated = databaseMigrate(opened.data)
  databaseClose(opened.data)
  if (!migrated.success) return operationFailure(migrated.errorMessage)

  process.stdout.write(`${JSON.stringify({ migrated: true, databasePath: config.data.databasePath })}\n`)
  return 0
}

function operationFailure(message: string): number {
  process.stderr.write(`${message}\n`)
  return 1
}

if (import.meta.main) process.exit(databaseMigrateMain())
