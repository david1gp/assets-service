import { contentSha256Create } from "../schemas/contentSha256Create.js"
import type { StorageMigrationInventoryItem } from "./storageMigrationInventoryItem.js"

export const storageMigrationInventoryFingerprintCreate = (
  inventory: readonly StorageMigrationInventoryItem[],
): string =>
  contentSha256Create(
    new TextEncoder().encode(
      JSON.stringify(
        inventory.map((item) => ({
          namespace: item.namespace,
          key: item.key,
          bucket: item.location.bucket,
          objectKey: item.location.objectKey,
          byteSize: item.object.byteSize,
          mediaType: item.object.mediaType,
          sha256: item.object.sha256,
          etag: item.object.etag ?? null,
          cacheControl: item.object.cacheControl ?? null,
          lastModified: item.object.lastModified ?? null,
        })),
      ),
    ),
  )
