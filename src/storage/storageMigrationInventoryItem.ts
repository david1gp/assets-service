import type { StorageNamespace } from "./storageNamespaceSchema.js"
import type { StorageObjectLocation } from "./storageObjectLocation.js"
import type { StorageObject } from "./storageObjectSchema.js"

export type StorageMigrationInventoryItem = {
  namespace: StorageNamespace
  key: string
  location: StorageObjectLocation & { bucket: string; objectKey: string }
  object: StorageObject & { mediaType: string; sha256: string }
}
