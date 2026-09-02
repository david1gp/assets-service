import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageMigrationCreateInput } from "./storageMigrationCreateInputSchema.js"
import type { StorageMigrationOwnership } from "./storageMigrationOwnership.js"
import type { StorageMigrationProgress } from "./storageMigrationProgressSchema.js"
import type { StorageMigration } from "./storageMigrationSchema.js"
import type { StorageMigrationStatus } from "./storageMigrationStatusSchema.js"

export type StorageMigrationRepository = {
  storageMigrationCreate: (input: StorageMigrationCreateInput, transaction?: AssetDatabase) => Result<StorageMigration>
  storageMigrationRead: (migrationId: string) => Result<StorageMigration | null>
  storageMigrationReadByIdempotencyKey: (
    environmentId: string,
    idempotencyKey: string,
  ) => Result<StorageMigration | null>
  storageMigrationReadActive: (environmentId: string, transaction?: AssetDatabase) => Result<StorageMigration | null>
  storageMigrationOwnershipAssert: (
    migrationId: string,
    ownership: StorageMigrationOwnership,
    now?: Date | string,
  ) => Result<null>
  storageMigrationStatusUpdate: (
    migrationId: string,
    status: StorageMigrationStatus,
    options: { ownership: StorageMigrationOwnership; lastError?: string | null; now?: Date | string },
  ) => Result<StorageMigration>
  storageMigrationProgressUpdate: (
    migrationId: string,
    progress: StorageMigrationProgress,
    options: {
      ownership: StorageMigrationOwnership
      now?: Date | string
      sourceInventoryFingerprint?: string
    },
  ) => Result<StorageMigration>
  storageMigrationCutover: (
    migrationId: string,
    ownership: StorageMigrationOwnership,
    now?: Date | string,
  ) => Result<StorageMigration>
}
