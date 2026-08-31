import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { outputDefinitionTable } from "../infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../infrastructure/db/schema/outputVersionTable.js"
import type { MediaMetadata } from "../metadata/mediaMetadataSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import type { Catalog } from "./catalogSchema.js"

type CatalogPublicationContext = {
  asset: typeof assetTable.$inferSelect
  source: {
    id: string
  }
  environment: typeof environmentTable.$inferSelect
  binding: StorageBinding
}

type CatalogPublishedOutput = {
  version: typeof outputVersionTable.$inferSelect
  definition: typeof outputDefinitionTable.$inferSelect
  metadata: MediaMetadata
}

type CatalogPublicationResult = {
  id: string
  generationId: string
  current: true
  catalog: Catalog
}

export type CatalogPublicationService = {
  catalogAssetPublish: (
    context: CatalogPublicationContext,
    outputs: readonly CatalogPublishedOutput[],
    now: Date,
  ) => Promise<Result<CatalogPublicationResult>>
  catalogProductionRebuild: (projectId: string, now?: Date) => Promise<Result<CatalogPublicationResult>>
}
