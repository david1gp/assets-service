import { lstat, readdir } from "node:fs/promises"
import { isAbsolute, join, relative, resolve, sep } from "node:path"

import type { ProjectSourceConfiguration } from "../config/projectSourceConfigurationSchema.js"
import type { AssetClass } from "../schemas/assetClassSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { nfcLexicalCompare } from "./nfcLexicalCompare.js"

const sourceClasses = ["image", "video", "document", "font"] as const

export type ConfiguredRootScanFile = {
  class: AssetClass
  filePath: string
  sourcePath: string
}

export type ConfiguredRootScan = {
  root: string
  files: readonly ConfiguredRootScanFile[]
}

const pathWithin = (root: string, candidate: string): boolean => {
  const path = relative(root, candidate)
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

const pathSort = (left: ConfiguredRootScanFile, right: ConfiguredRootScanFile): number =>
  nfcLexicalCompare(left.sourcePath, right.sourcePath)

const specialFileMessage = (filePath: string): string =>
  `The configured asset tree contains a special file: ${filePath}`

const pathComponentsCheck = async (root: string, candidate: string): Promise<Result<undefined>> => {
  const op = "configuredRootScan"
  const components = relative(root, candidate)
    .split(sep)
    .filter((component) => component.length > 0)
  let current = root
  for (const [index, component] of components.entries()) {
    let information: Awaited<ReturnType<typeof lstat>>
    try {
      information = await lstat(current)
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined
      if (code === "ENOENT") return { success: true, data: undefined }
      return resultErrorCreate(op, `Could not inspect configured asset path: ${current}`)
    }
    if (information.isSymbolicLink())
      return resultErrorCreate(op, `Symlinks are not allowed in asset trees: ${current}`)
    if (index < components.length && !information.isDirectory())
      return resultErrorCreate(op, specialFileMessage(current))
    current = join(current, component)
  }
  return { success: true, data: undefined }
}

const filesRead = async (
  root: string,
  assetClass: AssetClass,
  directory: string,
): Promise<Result<ConfiguredRootScanFile[]>> => {
  const op = "configuredRootScan"
  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch {
    return resultErrorCreate(op, `Could not read configured asset directory: ${directory}`)
  }
  entries.sort(nfcLexicalCompare)

  const files: ConfiguredRootScanFile[] = []
  for (const entry of entries) {
    const filePath = resolve(directory, entry)
    let information: Awaited<ReturnType<typeof lstat>>
    try {
      information = await lstat(filePath)
    } catch {
      return resultErrorCreate(op, `Could not inspect configured asset path: ${filePath}`)
    }
    if (information.isSymbolicLink())
      return resultErrorCreate(op, `Symlinks are not allowed in asset trees: ${filePath}`)
    if (information.isDirectory()) {
      const nested = await filesRead(root, assetClass, filePath)
      if (!nested.success) return nested
      files.push(...nested.data)
      continue
    }
    if (!information.isFile()) return resultErrorCreate(op, specialFileMessage(filePath))
    const sourcePath = relative(root, filePath).split(sep).join("/").normalize("NFC")
    if (!pathWithin(root, filePath) || sourcePath.length === 0)
      return resultErrorCreate(op, `The configured asset path escaped the project root: ${filePath}`)
    if (entry.toLowerCase().endsWith(".md") || (assetClass === "image" && entry.toLowerCase().endsWith(".txt")))
      continue
    files.push({ class: assetClass, filePath, sourcePath })
  }
  return { success: true, data: files }
}

export const configuredRootScan = async (
  rootInput: string,
  sourceDirectories: ProjectSourceConfiguration,
): Promise<Result<ConfiguredRootScan>> => {
  const op = "configuredRootScan"
  const root = resolve(rootInput)
  let rootInformation: Awaited<ReturnType<typeof lstat>>
  try {
    rootInformation = await lstat(root)
  } catch {
    return resultErrorCreate(op, `Could not inspect project root: ${root}`)
  }
  if (rootInformation.isSymbolicLink())
    return resultErrorCreate(op, `Symlinks are not allowed in project roots: ${root}`)
  if (!rootInformation.isDirectory()) return resultErrorCreate(op, specialFileMessage(root))
  const configuredRoots: Array<{ class: AssetClass; path: string }> = []
  for (const assetClass of sourceClasses) {
    const configured = sourceDirectories[assetClass]
    if (configured === null) continue
    const path = resolve(root, configured)
    if (!pathWithin(root, path))
      return resultErrorCreate(op, `The ${assetClass} source directory is outside the project root`)
    for (const existing of configuredRoots) {
      if (pathWithin(existing.path, path) || pathWithin(path, existing.path))
        return resultErrorCreate(op, `The ${existing.class} and ${assetClass} source directories overlap`)
    }
    configuredRoots.push({ class: assetClass, path })
  }

  const files: ConfiguredRootScanFile[] = []
  for (const configured of configuredRoots) {
    const componentsChecked = await pathComponentsCheck(root, configured.path)
    if (!componentsChecked.success) return componentsChecked
    let information: Awaited<ReturnType<typeof lstat>>
    try {
      information = await lstat(configured.path)
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined
      if (code === "ENOENT") continue
      return resultErrorCreate(op, `Could not inspect configured asset directory: ${configured.path}`)
    }
    if (information.isSymbolicLink())
      return resultErrorCreate(op, `Symlinks are not allowed in asset trees: ${configured.path}`)
    if (!information.isDirectory()) return resultErrorCreate(op, specialFileMessage(configured.path))
    const found = await filesRead(root, configured.class, configured.path)
    if (!found.success) return found
    files.push(...found.data)
  }

  files.sort(pathSort)
  return { success: true, data: { root, files } }
}
