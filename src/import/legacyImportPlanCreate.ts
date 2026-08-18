import { readFile, readdir } from "node:fs/promises"
import { basename, dirname, extname, join, relative, sep } from "node:path"
import * as v from "valibot"

import { assetFilenameSchema } from "../asset/assetFilenameSchema.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import { contentSha256Create } from "../schemas/contentSha256Create.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { legacyTransformParse } from "./legacyTransformParse.js"

type LegacyImportClass = "image" | "video" | "font"
type LegacyAiProvenance = "generated" | "enhanced" | null

type LegacyImportConflict = {
  path: string
  code: string
  message: string
  candidates?: string[]
}

type LegacyImageOutput = {
  kind: "image"
  key: string
  width: number
  height: number
  format: "jpg" | "png" | "webp" | "avif"
  byteSize: number
  sha256: string
  bytes: Uint8Array
  mediaType: string
  aiProvenance: LegacyAiProvenance
  showAiLabel?: boolean
  alt?: string
}

type LegacyVideoOutput = {
  kind: "video"
  key: "default"
  byteSize: number
  sha256: string
  bytes: Uint8Array
  mediaType: string
}

type LegacyFontOutput = {
  kind: "font"
  key: "default"
  format: "woff2"
  byteSize: number
  sha256: string
  bytes: Uint8Array
  mediaType: string
}

type LegacyImportOutput = LegacyImageOutput | LegacyVideoOutput | LegacyFontOutput

type LegacyImportGroup = {
  key: string
  class: LegacyImportClass
  folders: string[]
  filename: string
  basename: string
  sourcePath: string
  sourceBytes: Uint8Array
  sourceSha256: string
  sourceByteSize: number
  sourceMediaType: string
  alt: string | null
  aiProvenance: LegacyAiProvenance
  imageMetadata?: {
    width: number
    height: number
    format: "jpg" | "png" | "webp" | "avif"
    colorSpace: string
    alpha: boolean
    orientationApplied: boolean
    frameCount: number
    animated: boolean
    alt: string | null
    aiProvenance: LegacyAiProvenance
    showAiLabel?: boolean
  }
  videoMetadata?: {
    width: number
    height: number
    durationSeconds: number
    frameRate: number
    container: string
    videoCodec: string
    audioCodec: string | null
    streams: number
    bitrate: number | null
  }
  fontMetadata?: {
    family: string
    style: string
    weight: number
    width: number
    variableAxes: string[]
    glyphCount: number
    unicodeRanges: string[]
    format: string
  }
  outputs: LegacyImportOutput[]
  conflict: boolean
}

type LegacyImportPlan = {
  root: string
  groups: LegacyImportGroup[]
  conflicts: LegacyImportConflict[]
}

type GeneratedListEntry = {
  key: string
  path: string
  value: Record<string, unknown>
}

type GeneratedLists = Record<LegacyImportClass, GeneratedListEntry[]>

type FileEntry = { absolutePath: string; relativePath: string }

const sourceDirectories: Record<LegacyImportClass, string> = {
  image: "images",
  video: "videos",
  font: "fonts",
}

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".tiff", ".svg"])
const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"])
const fontExtensions = new Set([".woff2"])
const sidecarExtensions = new Set([".md", ".txt"])

export const legacyImportPlanCreate = async (
  root: string,
  options: { showAiLabel?: boolean } = {},
): Promise<Result<LegacyImportPlan>> => {
  const op = "legacyImportPlanCreate"
  const files = await fileEntriesRead(root)
  if (!files.success) return files

  const conflicts: LegacyImportConflict[] = []
  const generatedLists = await generatedListsRead(files.data, conflicts)
  const sidecars = await sidecarsRead(files.data, conflicts)
  const groups = new Map<string, LegacyImportGroup>()

  for (const file of files.data) {
    const parsed = await candidateRead(file, generatedLists, sidecars, options)
    if (!parsed.success) {
      conflicts.push(conflictCreate(file.relativePath, conflictCodeRead(parsed), parsed.errorMessage))
      continue
    }
    if (parsed.data === null) continue

    const candidate = parsed.data
    const groupKey = `${candidate.class}|${candidate.folders.join("/")}|${candidate.basename}`
    const current = groups.get(groupKey)
    if (current === undefined) {
      groups.set(groupKey, {
        key: groupKey,
        class: candidate.class,
        folders: candidate.folders,
        filename: candidate.filename,
        basename: candidate.basename,
        sourcePath: candidate.relativePath,
        sourceBytes: candidate.bytes,
        sourceSha256: candidate.sha256,
        sourceByteSize: candidate.bytes.byteLength,
        sourceMediaType: candidate.mediaType,
        alt: candidate.alt,
        aiProvenance: candidate.aiProvenance,
        ...(candidate.imageMetadata === undefined ? {} : { imageMetadata: candidate.imageMetadata }),
        ...(candidate.videoMetadata === undefined ? {} : { videoMetadata: candidate.videoMetadata }),
        ...(candidate.fontMetadata === undefined ? {} : { fontMetadata: candidate.fontMetadata }),
        outputs: [candidate.output],
        conflict: false,
      })
      continue
    }

    if (current.sourceSha256 !== candidate.sha256) {
      current.conflict = true
      const existingConflict = conflicts.find(
        (conflict) => conflict.code === "source_checksum_conflict" && conflict.path === current.sourcePath,
      )
      if (existingConflict === undefined) {
        conflicts.push(
          conflictCreate(
            current.sourcePath,
            "source_checksum_conflict",
            "Logical asset candidates have different source bytes",
            [current.sourcePath, candidate.relativePath],
          ),
        )
      } else {
        existingConflict.candidates = [
          ...new Set([...(existingConflict.candidates ?? []), candidate.relativePath]),
        ].sort()
      }
      continue
    }

    const duplicateOutput = current.outputs.find((output) => output.key === candidate.output.key)
    if (duplicateOutput !== undefined && !outputDefinitionEqual(duplicateOutput, candidate.output)) {
      current.conflict = true
      conflicts.push(
        conflictCreate(
          candidate.relativePath,
          "output_definition_conflict",
          `The output key ${candidate.output.key} has incompatible definitions`,
          [current.sourcePath, candidate.relativePath],
        ),
      )
      continue
    }
    if (duplicateOutput === undefined) current.outputs.push(candidate.output)
    current.alt = current.alt ?? candidate.alt
    if (
      current.aiProvenance !== candidate.aiProvenance &&
      current.aiProvenance !== null &&
      candidate.aiProvenance !== null
    ) {
      current.conflict = true
      conflicts.push(
        conflictCreate(
          candidate.relativePath,
          "ai_provenance_conflict",
          "Logical asset candidates have incompatible AI provenance",
          [current.sourcePath, candidate.relativePath],
        ),
      )
    }
    current.aiProvenance = current.aiProvenance ?? candidate.aiProvenance
    if (current.imageMetadata === undefined && candidate.imageMetadata !== undefined)
      current.imageMetadata = candidate.imageMetadata
    if (current.videoMetadata === undefined && candidate.videoMetadata !== undefined)
      current.videoMetadata = candidate.videoMetadata
    if (current.fontMetadata === undefined && candidate.fontMetadata !== undefined)
      current.fontMetadata = candidate.fontMetadata
  }

  const plannedGroups = [...groups.values()]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((group) => ({ ...group, outputs: group.outputs.toSorted((left, right) => left.key.localeCompare(right.key)) }))
  conflicts.sort(conflictCompare)
  return { success: true, data: { root, groups: plannedGroups, conflicts } }
}

async function fileEntriesRead(root: string): Promise<Result<FileEntry[]>> {
  const op = "legacyImportPlanFilesRead"
  const entries: FileEntry[] = []
  try {
    await collectFiles(root, root, entries)
    entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    return { success: true, data: entries }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}

async function collectFiles(root: string, directory: string, output: FileEntry[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(root, absolutePath, output)
      continue
    }
    if (entry.isFile()) {
      const relativePath = relative(root, absolutePath).split(sep).join("/")
      if (relativePath.startsWith("../") || relativePath === ".." || relativePath.startsWith("/")) continue
      output.push({ absolutePath, relativePath })
    }
  }
}

async function generatedListsRead(
  files: readonly FileEntry[],
  conflicts: LegacyImportConflict[],
): Promise<GeneratedLists> {
  const lists: GeneratedLists = { image: [], video: [], font: [] }
  const names: Record<string, LegacyImportClass> = {
    "imageList.ts": "image",
    "videoList.ts": "video",
    "fontList.ts": "font",
  }
  for (const file of files) {
    const className = names[basename(file.relativePath)]
    if (className === undefined) continue
    try {
      const content = await readFile(file.absolutePath, "utf8")
      const parsed = generatedListParse(content, `${className}List`)
      if (!parsed.success) {
        conflicts.push(conflictCreate(file.relativePath, "generated_list_invalid", parsed.errorMessage))
        continue
      }
      for (const [key, value] of Object.entries(parsed.data)) {
        if (!isRecord(value) || typeof value.path !== "string") {
          conflicts.push(conflictCreate(file.relativePath, "generated_list_invalid", `Entry ${key} has no path`))
          continue
        }
        lists[className].push({ key, path: value.path, value })
      }
    } catch (error) {
      conflicts.push(conflictCreate(file.relativePath, "generated_list_read_failed", errorMessageCreate(error)))
    }
  }
  for (const values of Object.values(lists)) values.sort((left, right) => left.key.localeCompare(right.key))
  return lists
}

async function sidecarsRead(
  files: readonly FileEntry[],
  conflicts: LegacyImportConflict[],
): Promise<Map<string, string>> {
  const candidates = new Map<string, { txt?: string; md?: string; paths: string[] }>()
  for (const file of files) {
    const extension = extname(file.relativePath).toLowerCase()
    if (!sidecarExtensions.has(extension)) continue
    const parsedPath = legacyPathParse(file.relativePath, true)
    if (!parsedPath.success || parsedPath.data === null || parsedPath.data.class !== "image") continue
    const key = `${parsedPath.data.class}|${parsedPath.data.folders.join("/")}|${parsedPath.data.basename}`
    const current = candidates.get(key) ?? { paths: [] }
    current.paths.push(file.relativePath)
    try {
      current[extension === ".txt" ? "txt" : "md"] = normalizeSidecar(await readFile(file.absolutePath, "utf8"))
    } catch (error) {
      conflicts.push(conflictCreate(file.relativePath, "sidecar_read_failed", errorMessageCreate(error)))
    }
    candidates.set(key, current)
  }

  const output = new Map<string, string>()
  for (const [key, value] of candidates) {
    const selected = value.txt ?? value.md
    if (selected !== undefined && selected.length > 0) output.set(key, selected)
  }
  return output
}

async function candidateRead(
  file: FileEntry,
  generatedLists: GeneratedLists,
  sidecars: ReadonlyMap<string, string>,
  options: { showAiLabel?: boolean },
): Promise<Result<LegacyCandidate | null>> {
  const extension = extname(file.relativePath).toLowerCase()
  if (sidecarExtensions.has(extension)) return { success: true, data: null }
  const parsedPath = legacyPathParse(file.relativePath)
  if (!parsedPath.success) return parsedPath
  if (parsedPath.data === null) return { success: true, data: null }
  const supported =
    parsedPath.data.class === "image"
      ? imageExtensions.has(extension)
      : parsedPath.data.class === "video"
        ? videoExtensions.has(extension)
        : fontExtensions.has(extension)
  if (!supported) return { success: true, data: null }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await readFile(file.absolutePath))
  } catch (error) {
    return resultErrorCreate("legacyImportCandidateRead", errorMessageCreate(error))
  }
  const sha256 = contentSha256Create(bytes)
  const listEntry = generatedListEntryRead(parsedPath.data, generatedLists)
  const sidecarKey = `${parsedPath.data.class}|${parsedPath.data.folders.join("/")}|${parsedPath.data.basename}`
  const alt =
    sidecars.get(sidecarKey) ??
    (typeof listEntry?.value.alt === "string" ? normalizeSidecar(listEntry.value.alt) : null)
  const mediaType = mediaTypeRead(parsedPath.data.class, extension, listEntry?.value.mimeType)

  if (parsedPath.data.class === "image") {
    if (parsedPath.data.transform === null) {
      return resultErrorCreate("legacyImportCandidateRead", "Image files must be inside a transform folder")
    }
    const transform = parsedPath.data.transform
    const aiProvenance = aiProvenanceMerge(transform.aiProvenance, aiProvenanceFromBasename(parsedPath.data.basename))
    const outputKey = transform.normalized
    const width = numberRead(listEntry?.value.width) ?? transform.width
    const height = numberRead(listEntry?.value.height) ?? transform.height
    const format = transform.format
    const metadata = {
      width,
      height,
      format,
      colorSpace: "srgb",
      alpha: false,
      orientationApplied: false,
      frameCount: 1,
      animated: false,
      alt,
      aiProvenance,
      ...(options.showAiLabel === undefined ? {} : { showAiLabel: options.showAiLabel }),
    }
    return {
      success: true,
      data: {
        class: "image",
        relativePath: file.relativePath,
        folders: parsedPath.data.folders,
        filename: parsedPath.data.filename,
        basename: parsedPath.data.basename,
        bytes,
        sha256,
        mediaType,
        alt,
        aiProvenance,
        imageMetadata: metadata,
        output: {
          kind: "image",
          key: outputKey,
          width: transform.width,
          height: transform.height,
          format,
          byteSize: bytes.byteLength,
          sha256,
          bytes,
          mediaType,
          aiProvenance,
          ...(options.showAiLabel === undefined ? {} : { showAiLabel: options.showAiLabel }),
          ...(alt === null ? {} : { alt }),
        },
      },
    }
  }

  if (parsedPath.data.class === "video") {
    const preview = isRecord(listEntry?.value.image) ? listEntry?.value.image : undefined
    const width = numberRead(preview?.width) ?? 1
    const height = numberRead(preview?.height) ?? 1
    const container = extension.slice(1) || "unknown"
    return {
      success: true,
      data: {
        class: "video",
        relativePath: file.relativePath,
        folders: parsedPath.data.folders,
        filename: parsedPath.data.filename,
        basename: parsedPath.data.basename,
        bytes,
        sha256,
        mediaType,
        alt: null,
        aiProvenance: null,
        videoMetadata: {
          width,
          height,
          durationSeconds: 0,
          frameRate: 0,
          container,
          videoCodec: "unknown",
          audioCodec: null,
          streams: 1,
          bitrate: null,
        },
        output: { kind: "video", key: "default", byteSize: bytes.byteLength, sha256, bytes, mediaType },
      },
    }
  }

  const font = fontMetadataRead(parsedPath.data.basename, listEntry?.value)
  return {
    success: true,
    data: {
      class: "font",
      relativePath: file.relativePath,
      folders: parsedPath.data.folders,
      filename: parsedPath.data.filename,
      basename: parsedPath.data.basename,
      bytes,
      sha256,
      mediaType,
      alt: null,
      aiProvenance: null,
      fontMetadata: font,
      output: { kind: "font", key: "default", format: "woff2", byteSize: bytes.byteLength, sha256, bytes, mediaType },
    },
  }
}

type LegacyCandidate = {
  class: LegacyImportClass
  relativePath: string
  folders: string[]
  filename: string
  basename: string
  bytes: Uint8Array
  sha256: string
  mediaType: string
  alt: string | null
  aiProvenance: LegacyAiProvenance
  imageMetadata?: LegacyImportGroup["imageMetadata"]
  videoMetadata?: LegacyImportGroup["videoMetadata"]
  fontMetadata?: LegacyImportGroup["fontMetadata"]
  output: LegacyImportOutput
}

type LegacyPath = {
  class: LegacyImportClass
  folders: string[]
  filename: string
  basename: string
  transform: LegacyTransform | null
}

type LegacyTransform = {
  width: number
  height: number
  format: "jpg" | "png" | "webp" | "avif"
  aiProvenance: LegacyAiProvenance
  normalized: string
}

function legacyPathParse(path: string, allowImageWithoutTransform = false): Result<LegacyPath | null> {
  const segments = path.split("/")
  const className =
    segments[0] === "images" ? "image" : segments[0] === "videos" ? "video" : segments[0] === "fonts" ? "font" : null
  if (className === null || segments.length < 2) return { success: true, data: null }
  const filename = segments.at(-1)
  if (filename === undefined) return resultErrorCreate("legacyImportPathParse", "The source filename is missing")
  const parsedFilename = v.safeParse(assetFilenameSchema, filename)
  if (!parsedFilename.success) return resultErrorCreate("legacyImportPathParse", "The source filename is invalid", path)
  const basenameValue = parsedFilename.output.slice(
    0,
    Math.max(0, parsedFilename.output.length - extname(parsedFilename.output).length),
  )
  const folderSegments = segments.slice(1, -1)
  const transformSegments: Array<{ index: number; value: NonNullable<LegacyPath["transform"]> }> = []
  if (className === "image") {
    for (const [index, segment] of folderSegments.entries()) {
      const parsedTransform = legacyTransformParse(segment)
      if (!parsedTransform.success) return parsedTransform
      if (parsedTransform.data !== null) transformSegments.push({ index, value: parsedTransform.data })
    }
  }
  if (className === "image" && transformSegments.length === 0 && !allowImageWithoutTransform)
    return resultErrorCreate("legacyImportPathParse", "Image files must be inside a transform folder", path)
  if (transformSegments.length > 1)
    return resultErrorCreate(
      "legacyImportPathParse",
      transformSegments.length > 1 ? "Nested or multiple transform folders are not supported" : "",
      path,
    )
  const folders = folderSegments.filter(
    (_segment, index) => !transformSegments.some((transform) => transform.index === index),
  )
  const parsedFolders = v.safeParse(foldersSchema, folders)
  if (!parsedFolders.success)
    return resultErrorCreate("legacyImportPathParse", "The logical folder path is invalid", path)
  return {
    success: true,
    data: {
      class: className,
      folders: parsedFolders.output,
      filename: parsedFilename.output,
      basename: basenameValue,
      transform: transformSegments[0]?.value ?? null,
    },
  }
}

function generatedListEntryRead(path: LegacyPath, lists: GeneratedLists): GeneratedListEntry | undefined {
  const list = lists[path.class]
  const sourceRelative = [...path.folders, path.filename].join("/")
  const exact = list.find(
    (entry) =>
      normalizeListPath(entry.path) === sourceRelative ||
      normalizeListPath(entry.path) === `${sourceDirectories[path.class]}/${sourceRelative}`,
  )
  if (exact !== undefined) return exact
  const basenameKey = path.basename.replaceAll("-", "_")
  const keyMatches = list.filter((entry) => entry.key === basenameKey || entry.key.startsWith(`${basenameKey}_`))
  if (path.transform !== null) {
    const dimensionMatches = keyMatches.filter(
      (entry) =>
        numberRead(entry.value.width) === path.transform?.width &&
        numberRead(entry.value.height) === path.transform?.height,
    )
    if (dimensionMatches.length > 0) return dimensionMatches[0]
  }
  return keyMatches[0]
}

function generatedListParse(content: string, exportName: string): Result<Record<string, unknown>> {
  const marker = `export const ${exportName}`
  const markerIndex = content.indexOf(marker)
  if (markerIndex < 0) return resultErrorCreate("legacyGeneratedListParse", `The export ${exportName} was not found`)
  const objectStart = content.indexOf("{", markerIndex + marker.length)
  if (objectStart < 0) return resultErrorCreate("legacyGeneratedListParse", "The generated list object was not found")
  const objectEnd = jsonObjectEndRead(content, objectStart)
  if (objectEnd === null)
    return resultErrorCreate("legacyGeneratedListParse", "The generated list object was incomplete")
  try {
    const value: unknown = JSON.parse(content.slice(objectStart, objectEnd + 1))
    if (!isRecord(value)) return resultErrorCreate("legacyGeneratedListParse", "The generated list was not an object")
    return { success: true, data: value }
  } catch (error) {
    return resultErrorCreate("legacyGeneratedListParse", errorMessageCreate(error))
  }
}

function jsonObjectEndRead(content: string, start: number): number | null {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < content.length; index += 1) {
    const character = content[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === "{") depth += 1
    if (character === "}") {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return null
}

function fontMetadataRead(
  basenameValue: string,
  listValue: Record<string, unknown> | undefined,
): LegacyImportGroup["fontMetadata"] {
  const parts = basenameValue.split("-")
  const weightPart = parts.at(-1)
  const knownWeights: Record<string, number> = {
    thin: 100,
    extralight: 200,
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  }
  const parsedWeight =
    weightPart !== undefined && /^\d+$/.test(weightPart) ? Number.parseInt(weightPart, 10) : undefined
  const weight =
    numberRead(listValue?.fontWeight) ??
    parsedWeight ??
    (weightPart ? knownWeights[weightPart.toLowerCase()] : undefined) ??
    400
  const styleValue = String(listValue?.fontStyle ?? (parts.at(-1)?.toLowerCase() === "italic" ? "italic" : "normal"))
  const family = String(listValue?.fontFamily ?? (parts.length > 1 ? parts.slice(0, -1).join(" ") : basenameValue))
  return {
    family,
    style: styleValue,
    weight,
    width: 5,
    variableAxes: [],
    glyphCount: 0,
    unicodeRanges: [],
    format: "woff2",
  }
}

function aiProvenanceFromBasename(value: string): LegacyAiProvenance {
  if (/(?:-|_)ai-generated$/i.test(value)) return "generated"
  if (/(?:-|_)ai-(?:modified|enhanced)$/i.test(value) || /(?:-|_)ai_(?:modified|enhanced)$/i.test(value))
    return "enhanced"
  return null
}

function aiProvenanceMerge(left: LegacyAiProvenance, right: LegacyAiProvenance): LegacyAiProvenance {
  return left ?? right
}

function outputDefinitionEqual(left: LegacyImportOutput, right: LegacyImportOutput): boolean {
  if (left.kind !== right.kind || left.key !== right.key) return false
  if (left.kind === "image" && right.kind === "image") {
    return (
      left.width === right.width &&
      left.height === right.height &&
      left.format === right.format &&
      left.showAiLabel === right.showAiLabel
    )
  }
  if (left.kind === "font" && right.kind === "font") return left.format === right.format
  return true
}

function mediaTypeRead(className: LegacyImportClass, extension: string, listMediaType: unknown): string {
  if (typeof listMediaType === "string" && listMediaType.length > 0) return listMediaType
  if (className === "image") {
    if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg"
    if (extension === ".png") return "image/png"
    if (extension === ".webp") return "image/webp"
    if (extension === ".avif") return "image/avif"
    if (extension === ".svg") return "image/svg+xml"
    return "image/tiff"
  }
  if (className === "video") {
    if (extension === ".mp4" || extension === ".m4v") return "video/mp4"
    if (extension === ".mov") return "video/quicktime"
    if (extension === ".webm") return "video/webm"
    if (extension === ".avi") return "video/x-msvideo"
    return "video/x-matroska"
  }
  return "font/woff2"
}

function normalizeListPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "")
}

function normalizeSidecar(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function numberRead(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function errorMessageCreate(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function conflictCreate(path: string, code: string, message: string, candidates?: string[]): LegacyImportConflict {
  return {
    path,
    code,
    message,
    ...(candidates === undefined ? {} : { candidates: [...new Set(candidates)].sort() }),
  }
}

function conflictCompare(left: LegacyImportConflict, right: LegacyImportConflict): number {
  const pathOrder = left.path.localeCompare(right.path)
  if (pathOrder !== 0) return pathOrder
  const codeOrder = left.code.localeCompare(right.code)
  if (codeOrder !== 0) return codeOrder
  return left.message.localeCompare(right.message)
}

function conflictCodeRead(result: { op: string; errorMessage: string }): string {
  if (result.op === "legacyImportPathParse" || result.op === "legacyTransformParse") {
    if (result.errorMessage.includes("Nested or multiple")) return "nested_transform"
    if (result.errorMessage.includes("Image files")) return "missing_transform"
    if (result.errorMessage.includes("transform folder") || result.op === "legacyTransformParse")
      return "invalid_transform"
    if (result.errorMessage.includes("logical folder")) return "folder_depth_exceeded"
  }
  return "source_read_failed"
}
