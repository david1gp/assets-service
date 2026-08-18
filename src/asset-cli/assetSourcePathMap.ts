import { isAbsolute, relative, resolve, sep } from "node:path"
import * as v from "valibot"

import { assetBasenameCreate } from "../asset/assetBasenameCreate.js"
import { assetBasenameSchema } from "../asset/assetBasenameSchema.js"
import { assetFilenameSchema } from "../asset/assetFilenameSchema.js"
import { assetSourcePathCreate } from "../asset/assetSourcePathCreate.js"
import { type Folders, foldersSchema } from "../asset/foldersSchema.js"
import type { AssetClass } from "../schemas/assetClassSchema.js"
import { assetClassSchema } from "../schemas/assetClassSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type AssetTargetKeys, assetTargetKeysCreate } from "./assetTargetKeysCreate.js"
import type { ConfiguredRootScanFile } from "./configuredRootScan.js"

export type AssetSourcePathMapping = {
  class: AssetClass
  filePath: string
  sourcePath: string
  logicalPath: string
  folders: Folders
  filename: string
  basename: string
  keys: AssetTargetKeys
}

const pathWithin = (root: string, candidate: string): boolean => {
  const path = relative(root, candidate)
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

export const assetSourcePathMap = (input: {
  root: string
  classRoot: string
  file: ConfiguredRootScanFile
}): Result<AssetSourcePathMapping> => {
  const op = "assetSourcePathMap"
  const root = resolve(input.root)
  const classRoot = resolve(root, input.classRoot)
  const filePath = resolve(input.file.filePath)
  const parsedClass = v.safeParse(assetClassSchema, input.file.class)
  if (!parsedClass.success) return resultErrorCreate(op, "The asset class was invalid", parsedClass.issues)
  if (!pathWithin(root, classRoot) || !pathWithin(classRoot, filePath))
    return resultErrorCreate(op, `The asset path was outside its configured class root: ${filePath}`)

  const relativePath = relative(classRoot, filePath).split(sep).join("/")
  const expectedSourcePath = relative(root, filePath).split(sep).join("/").normalize("NFC")
  if (input.file.sourcePath.normalize("NFC") !== expectedSourcePath)
    return resultErrorCreate(op, `The scanned source path did not match the asset file: ${filePath}`)
  const segments = relativePath.split("/")
  const filenameInput = segments.pop()
  if (filenameInput === undefined || filenameInput.length === 0)
    return resultErrorCreate(op, `The asset filename was missing: ${filePath}`)
  const parsedFolders = v.safeParse(foldersSchema, segments)
  if (!parsedFolders.success)
    return resultErrorCreate(op, "The asset path exceeds the maximum folder depth", parsedFolders.issues)
  const parsedFilename = v.safeParse(assetFilenameSchema, filenameInput)
  if (!parsedFilename.success) return resultErrorCreate(op, "The asset filename was invalid", parsedFilename.issues)
  const basename = assetBasenameCreate(parsedFilename.output)
  const parsedBasename = v.safeParse(assetBasenameSchema, basename)
  if (!parsedBasename.success) return resultErrorCreate(op, "The asset basename was invalid", parsedBasename.issues)

  const folders = parsedFolders.output
  const filename = parsedFilename.output
  const sourcePath = expectedSourcePath
  const logicalPath = assetSourcePathCreate(folders, filename)
  return {
    success: true,
    data: {
      class: parsedClass.output,
      filePath,
      sourcePath,
      logicalPath,
      folders,
      filename,
      basename: parsedBasename.output,
      keys: assetTargetKeysCreate(parsedClass.output, folders, filename),
    },
  }
}
