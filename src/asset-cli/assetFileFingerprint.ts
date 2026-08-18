import { createReadStream } from "node:fs"
import { lstat } from "node:fs/promises"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { Sha256 } from "../schemas/sha256Schema.js"
import type { UploadSupportedMediaType } from "../upload/uploadSupportedMediaTypes.js"
import type { AssetSourcePathMapping } from "./assetSourcePathMap.js"

export type AssetFileIdentity = {
  device: number
  inode: number
  size: number
  mtimeMs: number
  ctimeMs: number
}

export type AssetFileFingerprint = {
  byteSize: number
  sha256: Sha256
  mediaType: UploadSupportedMediaType
  identity: AssetFileIdentity
}

const identityRead = (information: Awaited<ReturnType<typeof lstat>>): AssetFileIdentity => ({
  device: Number(information.dev),
  inode: Number(information.ino),
  size: Number(information.size),
  mtimeMs: Number(information.mtimeMs),
  ctimeMs: Number(information.ctimeMs),
})

const identityEqual = (left: AssetFileIdentity, right: AssetFileIdentity): boolean =>
  left.device === right.device &&
  left.inode === right.inode &&
  left.size === right.size &&
  left.mtimeMs === right.mtimeMs &&
  left.ctimeMs === right.ctimeMs

export const assetFileFingerprint = async (
  mapping: AssetSourcePathMapping,
  mediaType: UploadSupportedMediaType,
): Promise<Result<AssetFileFingerprint>> => {
  const op = "assetFileFingerprint"
  let before: Awaited<ReturnType<typeof lstat>>
  try {
    before = await lstat(mapping.filePath)
  } catch {
    return resultErrorCreate(op, `Could not inspect asset file: ${mapping.filePath}`)
  }
  if (before.isSymbolicLink())
    return resultErrorCreate(op, `Symlinks are not allowed in asset trees: ${mapping.filePath}`)
  if (!before.isFile())
    return resultErrorCreate(op, `Special files are not allowed in asset trees: ${mapping.filePath}`)
  const beforeIdentity = identityRead(before)

  const hasher = new Bun.CryptoHasher("sha256")
  let byteSize = 0
  try {
    for await (const chunk of createReadStream(mapping.filePath)) {
      hasher.update(chunk)
      byteSize += chunk.byteLength
    }
  } catch {
    return resultErrorCreate(op, `Could not read asset file: ${mapping.filePath}`)
  }

  let after: Awaited<ReturnType<typeof lstat>>
  try {
    after = await lstat(mapping.filePath)
  } catch {
    return resultErrorCreate(op, `Could not recheck asset file: ${mapping.filePath}`)
  }
  if (after.isSymbolicLink())
    return resultErrorCreate(op, `Symlinks are not allowed in asset trees: ${mapping.filePath}`)
  if (!after.isFile()) return resultErrorCreate(op, `Special files are not allowed in asset trees: ${mapping.filePath}`)
  if (!identityEqual(beforeIdentity, identityRead(after)) || byteSize !== after.size)
    return resultErrorCreate(op, `The asset file changed while it was being read: ${mapping.filePath}`)

  return {
    success: true,
    data: {
      byteSize,
      sha256: hasher.digest("hex") as Sha256,
      mediaType,
      identity: beforeIdentity,
    },
  }
}
