import { serviceConfigRead } from "../config/serviceConfigRead.js"
import { databaseClose } from "../infrastructure/db/databaseClose.js"
import { databaseOpen } from "../infrastructure/db/databaseOpen.js"
import { backupMigrationCliOptionsRead } from "./backupMigrationCliOptionsRead.js"
import { backupRemotePathMigrationServiceCreate } from "./backupRemotePathMigrationServiceCreate.js"
import { rcloneBackupRemotePathMigrationAdapterProduction } from "./rcloneBackupRemotePathMigrationAdapterProduction.js"

export const backupMigrateMain = async (args: readonly string[] = process.argv.slice(2)): Promise<number> => {
  const options = backupMigrationCliOptionsRead(args)
  if (!options.success) return operationFailure(options.errorMessage)

  const config = serviceConfigRead()
  if (!config.success) return operationFailure(config.errorMessage)
  const opened = databaseOpen(config.data.databasePath)
  if (!opened.success) return operationFailure(opened.errorMessage)
  const adapter = rcloneBackupRemotePathMigrationAdapterProduction({
    rcloneExecutable: config.data.rcloneExecutable,
    rcloneRemote: config.data.rcloneRemote,
    rcloneBackupRoot: config.data.rcloneBackupRoot,
    rcloneTimeoutMs: config.data.rcloneTimeoutMs,
  })
  const service = backupRemotePathMigrationServiceCreate({ db: opened.data.db, adapter })
  const result = options.data.execute
    ? await service.apply(options.data.runId === undefined ? {} : { runId: options.data.runId })
    : await service.plan()
  databaseClose(opened.data)
  if (!result.success) return operationFailure(result.errorMessage)
  process.stdout.write(`${JSON.stringify(result.data)}\n`)
  return migrationReportNeedsAttention(result.data) ? 1 : 0
}

function migrationReportNeedsAttention(report: {
  status: string
  plannedReceiptIds: readonly string[]
  skippedItems: readonly unknown[]
  missingItems: readonly unknown[]
  collisions: readonly unknown[]
}): boolean {
  return (
    report.status === "blocked" ||
    report.plannedReceiptIds.length > 0 ||
    report.skippedItems.length > 0 ||
    report.missingItems.length > 0 ||
    report.collisions.length > 0
  )
}

function operationFailure(message: string): number {
  process.stderr.write(`${message}\n`)
  return 1
}

if (import.meta.main) process.exit(await backupMigrateMain())
