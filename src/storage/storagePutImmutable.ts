import * as v from "valibot"

import { contentSha256Create } from "../schemas/contentSha256Create.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "./storageAdapter.js"
import type { StorageObjectLocation } from "./storageObjectLocation.js"
import type { StorageObject } from "./storageObjectSchema.js"
import { storagePublicObjectKeyValidate } from "./storagePublicObjectKeyValidate.js"

export const storagePutImmutable = async (
  adapter: StorageAdapter,
  input: {
    location: StorageObjectLocation & { bucket: string; objectKey: string }
    bytes: Uint8Array
    mediaType: string
    sha256?: string
  },
): Promise<Result<StorageObject>> => {
  if (input.location.namespace === "public-output") {
    const key = storagePublicObjectKeyValidate(input.location.key)
    if (!key.success) return key
  }
  const mediaType = v.safeParse(mediaTypeSchema, input.mediaType)
  if (!mediaType.success) return resultErrorCreate("storagePutImmutable", "Storage media type was invalid")
  if (input.sha256 !== undefined && input.sha256 !== contentSha256Create(input.bytes))
    return resultErrorCreate("storagePutImmutable", "Storage checksum does not match the bytes")
  return adapter.putImmutable(input)
}
