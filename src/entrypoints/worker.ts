import { serviceConfigRead } from "../config/serviceConfigRead.js"
import { telegramConfigRead } from "../config/telegramConfigRead.js"
import { databaseClose } from "../infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../infrastructure/db/databaseOpen.js"
import { rcloneBackupAdapterProduction } from "../infrastructure/rclone/rcloneBackupAdapterProduction.js"
import { r2StorageAdapterCreate } from "../infrastructure/storage/r2StorageAdapter.js"
import { telegramAdapterProduction } from "../infrastructure/telegram/telegramAdapterProduction.js"
import { telegramOutboxDispatcherCreate } from "../notification/telegramOutboxDispatcherCreate.js"
import { assetWorkflowHandlersRegister } from "../workflow/assetWorkflowHandlersRegister.js"
import { jobHandlerRegistryCreate } from "../workflow/jobHandlerRegistryCreate.js"
import { workflowEngineCreate } from "../workflow/workflowEngineCreate.js"

export const workerMain = async (): Promise<number> => {
  const config = serviceConfigRead()
  if (!config.success) {
    process.stderr.write(`${config.errorMessage}\n`)
    return 1
  }

  const telegramConfig = telegramConfigRead()
  if (!telegramConfig.success) {
    process.stderr.write(`${telegramConfig.errorMessage}\n`)
    return 1
  }

  const connection = databaseOpen(config.data.databasePath)
  if (!connection.success) {
    process.stderr.write(`${connection.errorMessage}\n`)
    return 1
  }

  const migrated = databaseMigrate(connection.data)
  if (!migrated.success) {
    databaseClose(connection.data)
    process.stderr.write(`${migrated.errorMessage}\n`)
    return 1
  }

  const handlers = jobHandlerRegistryCreate()
  const storage = r2StorageAdapterCreate({
    accountId: config.data.r2AccountId,
    accessKeyId: config.data.r2AccessKeyId,
    secretAccessKey: config.data.r2SecretAccessKey,
    endpoint: config.data.r2Endpoint,
  })
  const registered = assetWorkflowHandlersRegister(handlers, {
    db: connection.data.db,
    storage,
    backup: rcloneBackupAdapterProduction(config.data),
    adminBaseUrl: config.data.apiHost,
  })
  if (!registered.success) {
    databaseClose(connection.data)
    process.stderr.write(`${registered.errorMessage}\n`)
    return 1
  }
  const engine = workflowEngineCreate({
    db: connection.data.db,
    workerId: config.data.workerId,
    handlerRegistry: handlers,
  })
  const dispatcher =
    telegramConfig.data === null
      ? null
      : telegramOutboxDispatcherCreate({
          db: connection.data.db,
          adapter: telegramAdapterProduction(telegramConfig.data),
          workerId: `${config.data.workerId}:telegram`,
          maxAttempts: telegramConfig.data.maxAttempts,
          leaseMs: telegramConfig.data.leaseMs,
          pollMs: telegramConfig.data.pollMs,
          retryBaseMs: telegramConfig.data.retryBaseMs,
        })
  const shutdown = () => {
    engine.stop()
    dispatcher?.stop()
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
  const results = await Promise.all([engine.run(), ...(dispatcher === null ? [] : [dispatcher.run()])])
  const result = results.find((candidate) => !candidate.success) ?? { success: true, data: null }
  process.removeListener("SIGINT", shutdown)
  process.removeListener("SIGTERM", shutdown)
  databaseClose(connection.data)
  if (!result.success) {
    process.stderr.write(`${result.errorMessage}\n`)
    return 1
  }
  return 0
}

if (import.meta.main) process.exit(await workerMain())
