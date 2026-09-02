import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import type { JobHandler } from "../workflow/jobHandler.js"
import type { JobKind } from "../workflow/jobKindSchema.js"
import { storageMigrationWorkflowHandle } from "./storageMigrationWorkflowHandle.js"

type StorageMigrationWorkflowHandlerRegistry = {
  register: (kind: JobKind, handler: JobHandler) => Result<null>
}

type StorageMigrationWorkflowHandlersRegisterInput = {
  db: AssetDatabase
  storage: StorageAdapter
  clock?: () => Date
  destinationPublicUrlVerifier?: Parameters<typeof storageMigrationWorkflowHandle>[2]["destinationPublicUrlVerifier"]
}

export const storageMigrationWorkflowHandlersRegister = (
  registry: StorageMigrationWorkflowHandlerRegistry,
  input: StorageMigrationWorkflowHandlersRegisterInput,
): Result<null> =>
  registry.register("migrate_storage", (job, context) =>
    storageMigrationWorkflowHandle(job, context, {
      db: input.db,
      storage: input.storage,
      clock: input.clock,
      destinationPublicUrlVerifier: input.destinationPublicUrlVerifier,
    }),
  )
