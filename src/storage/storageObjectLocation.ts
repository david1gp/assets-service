import type { StorageBinding } from "./storageBindingSchema.js"
import type { StorageNamespace } from "./storageNamespaceSchema.js"

export type StorageObjectLocation = {
  binding: StorageBinding
  namespace: StorageNamespace
  key: string
}
