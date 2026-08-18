import { randomUUID } from "node:crypto"
import { link, mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises"
import { dirname, extname, join, relative, resolve, sep } from "node:path"
import * as v from "valibot"

import { assetBasenameCreate } from "../asset/assetBasenameCreate.js"
import { assetFilenameSchema } from "../asset/assetFilenameSchema.js"
import { assetIdentifierCreate } from "../asset/assetIdentifierCreate.js"
import { type Folders, foldersSchema } from "../asset/foldersSchema.js"
import { canonicalJsonDigest } from "../catalog/canonicalJsonDigest.js"
import { canonicalJsonStringify } from "../catalog/canonicalJsonStringify.js"
import { catalogListsCheck } from "../catalog/catalogListsCheck.js"
import { catalogListsRender } from "../catalog/catalogListsRender.js"
import { catalogListsWrite } from "../catalog/catalogListsWrite.js"
import { legacyTransformParse } from "../import/legacyTransformParse.js"
import type { ImageMetadata } from "../metadata/imageMetadataSchema.js"
import type { MediaMetadata } from "../metadata/mediaMetadataSchema.js"
import { type OutputFormat, outputFormatSchema } from "../output/outputFormatSchema.js"
import { outputLocalObjectKeyCreate } from "../output/outputLocalObjectKeyCreate.js"
import { fontOutputFormatSchema } from "../processing/fontOutputFormatSchema.js"
import { fontProcess } from "../processing/fontProcess.js"
import { imageProcess } from "../processing/imageProcess.js"
import { videoProcess } from "../processing/videoProcess.js"
import { staticReferenceCountsCreate } from "../reference-analysis/staticReferenceCountsCreate.js"
import { contentSha256Create } from "../schemas/contentSha256Create.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type LocalAssetState, localAssetStateSchema } from "./localAssetStateSchema.js"
import type { LocalOutputPublisher } from "./localOutputPublisher.js"

type LocalAsset = LocalAssetState["assets"][number]
type LocalOutput = LocalAsset["outputs"][number]
type LocalOutputDefinition =
  | {
      kind: "image"
      key: string
      width: number
      height: number
      format: OutputFormat
      quality?: number
      showAiLabel?: boolean
    }
  | { kind: "video"; key: string }
  | { kind: "font"; key: string; format: "woff2" }

type LocalServiceOptions = {
  root: string
  outputDir?: string
  statePath: string
  now?: () => Date
  outputPublisher?: LocalOutputPublisher
  remoteRequired?: boolean
}

type LocalAssetCandidate = {
  class: "image" | "video" | "font"
  folders: Folders
  filename: string
  basename: string
  sourcePath: string
  sourceBytes: Uint8Array
  sourceSha256: string
  sourceMediaType: string
  output: LocalOutputDefinition
  alt?: string
  aiProvenance?: "generated" | "enhanced"
}

type LocalAssetGroup = {
  class: LocalAssetCandidate["class"]
  folders: Folders
  filename: string
  basename: string
  sourcePath: string
  sourceBytes: Uint8Array
  sourceSha256: string
  sourceMediaType: string
  alt?: string
  aiProvenance?: "generated" | "enhanced"
  outputs: LocalOutputDefinition[]
}

type LocalConflict = { path: string; code: string; message: string; candidates?: string[] }

type LocalScan = { groups: LocalAssetGroup[]; conflicts: LocalConflict[] }

type LocalTransform = {
  width: number
  height: number
  format: "jpg" | "png" | "webp" | "avif"
  aiProvenance: "generated" | "enhanced" | null
  normalized: string
}

type ParsedSource = {
  class: "image" | "video" | "font"
  folders: Folders
  filename: string
  basename: string
  aiProvenance?: "generated" | "enhanced"
  transform?: LocalTransform
}

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".tiff", ".svg"])
const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"])
const fontExtensions = new Set([".ttf", ".otf", ".woff", ".woff2"])
const sidecarExtensions = new Set([".md", ".txt"])

export const assetsLocalServiceCreate = (options: LocalServiceOptions) => {
  const root = resolve(options.root)
  const configuredOutputDir = options.outputDir === undefined ? undefined : resolve(options.outputDir)
  const statePath = resolve(options.statePath)
  const nowRead = options.now ?? (() => new Date())
  const outputPublisher = options.outputPublisher
  const remoteRequired = options.remoteRequired ?? false

  const stateRead = async (): Promise<Result<LocalAssetState>> => {
    let content: string
    try {
      content = await readFile(statePath, "utf8")
    } catch (error) {
      if (isErrorCode(error, "ENOENT")) return { success: true, data: stateCreate() }
      return resultErrorCreate("assetsLocalStateRead", errorMessageCreate(error), { statePath })
    }
    let value: unknown
    try {
      value = JSON.parse(content)
    } catch (error) {
      return resultErrorCreate(
        "assetsLocalStateRead",
        "The local state file is not valid JSON",
        errorMessageCreate(error),
      )
    }
    const parsed = v.safeParse(localAssetStateSchema, value)
    if (!parsed.success) return resultErrorCreate("assetsLocalStateRead", v.summarize(parsed.issues))
    if (resolve(parsed.output.root) !== root)
      return resultErrorCreate(
        "assetsLocalStateRead",
        "The local state belongs to a different root",
        parsed.output.root,
      )
    return {
      success: true,
      data: configuredOutputDir === undefined ? parsed.output : { ...parsed.output, outputDir: configuredOutputDir },
    }
  }

  const stateWrite = async (state: LocalAssetState): Promise<Result<undefined>> => {
    const parsed = v.safeParse(localAssetStateSchema, state)
    if (!parsed.success) return resultErrorCreate("assetsLocalStateWrite", v.summarize(parsed.issues), state)
    return atomicJsonWrite(statePath, parsed.output, "assetsLocalStateWrite")
  }

  const processAsset = async (
    asset: LocalAsset,
    sourceBytes: Uint8Array,
    outputDir: string,
  ): Promise<Result<LocalAsset>> => {
    const outputs: LocalOutput[] = []
    for (const output of asset.outputs.toSorted((left, right) => left.key.localeCompare(right.key))) {
      const definition = localOutputDefinitionRead(output)
      if (!definition.success) return definition
      const processed = await outputProcess(asset, sourceBytes, definition.data)
      if (!processed.success) return processed
      const path = outputLocalObjectKeyCreate({
        assetClass: asset.class,
        folders: asset.folders,
        basename: asset.basename,
        outputKey: definition.data.key,
        sha256: contentSha256Create(processed.data.bytes),
        extension: processed.data.extension,
      })
      const stored = await immutableFileWrite(join(outputDir, path), processed.data.bytes, processed.data.sha256)
      if (!stored.success) return stored
      outputs.push({
        ...definition.data,
        path,
        sha256: processed.data.sha256,
        byteSize: processed.data.bytes.byteLength,
        mediaType: processed.data.mediaType,
        metadata: processed.data.metadata,
      } as LocalOutput)
    }
    const metadata = outputs[0]?.metadata
    if (metadata === undefined) return resultErrorCreate("assetsLocalProcess", "An asset must have an output")
    const currentPaths = new Set(outputs.map((output) => output.path))
    return {
      success: true,
      data: {
        ...asset,
        publishedAt: undefined,
        metadata,
        outputs,
        unreferencedPaths: [
          ...new Set([
            ...asset.unreferencedPaths,
            ...asset.outputs
              .map((output) => output.path)
              .filter((path) => path !== "pending" && !currentPaths.has(path)),
          ]),
        ],
        updatedAt: nowRead().toISOString(),
      },
    }
  }

  const process = async (): Promise<Result<{ assets: LocalAsset[] }>> => {
    const state = await stateRead()
    if (!state.success) return state
    const processed: LocalAsset[] = []
    for (const asset of state.data.assets.toSorted(assetCompare)) {
      const bytes = await assetSourceBytesRead(state.data, asset)
      if (!bytes.success) return bytes
      const result = await processAsset(asset, bytes.data, state.data.outputDir)
      if (!result.success) return result
      processed.push(result.data)
    }
    const written = await stateWrite({ ...state.data, assets: processed })
    if (!written.success) return written
    return { success: true, data: { assets: processed } }
  }

  const importAssets = async (
    importRoot: string,
    importOptions: { atomicity?: "all_or_nothing" | "partial"; showAiLabel?: boolean } = {},
  ): Promise<Result<{ assets: LocalAsset[]; conflicts: LocalConflict[] }>> => {
    const resolvedImportRoot = resolve(importRoot)
    const scan = await localScanCreate(resolvedImportRoot, importOptions.showAiLabel)
    if (!scan.success) return scan
    if (scan.data.conflicts.length > 0 && (importOptions.atomicity ?? "all_or_nothing") === "all_or_nothing") {
      return resultErrorCreate("assetsLocalImport", "The import contains conflicts", { conflicts: scan.data.conflicts })
    }
    const current = await stateRead()
    if (!current.success) return current
    const existing = new Map(current.data.assets.map((asset) => [assetIdentityKey(asset), asset]))
    const assets: LocalAsset[] = []
    for (const group of scan.data.groups) {
      const previous = existing.get(assetGroupIdentityKey(group))
      const draft = localAssetDraftCreate(group, previous, root, configuredOutputDir ?? current.data.outputDir, nowRead)
      const processed = await processAsset(draft, group.sourceBytes, configuredOutputDir ?? current.data.outputDir)
      if (!processed.success) {
        const conflict = conflictCreate(group.sourcePath, "processing_failed", processed.errorMessage)
        if ((importOptions.atomicity ?? "all_or_nothing") === "all_or_nothing") return processed
        scan.data.conflicts.push(conflict)
        continue
      }
      assets.push(processed.data)
    }
    for (const asset of current.data.assets) {
      if (asset.publishedAt !== undefined && !assets.some((candidate) => candidate.id === asset.id)) assets.push(asset)
    }
    assets.sort(assetCompare)
    const written = await stateWrite({
      schema: "assets.local-state.v1",
      root,
      outputDir: configuredOutputDir ?? current.data.outputDir,
      assets,
    })
    if (!written.success) return written
    return { success: true, data: { assets, conflicts: scan.data.conflicts.toSorted(conflictCompare) } }
  }

  const upload = async (
    filePath: string,
    targetPath: string,
    integrationNote?: string,
  ): Promise<Result<{ asset: LocalAsset; path: string }>> => {
    if (outputPublisher === undefined)
      return resultErrorCreate(
        "assetsLocalUpload",
        "Local upload requires R2 credentials, an R2 endpoint, and an R2 bucket",
      )
    const target = localTargetPathRead(targetPath)
    if (!target.success) return target
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await readFile(resolve(filePath)))
    } catch (error) {
      return resultErrorCreate("assetsLocalUpload", `Could not read ${filePath}`, errorMessageCreate(error))
    }
    const destination = join(root, target.data)
    if (!pathWithin(root, destination))
      return resultErrorCreate("assetsLocalUpload", "The upload path escaped the root")
    const stored = await sourceFileWrite(destination, bytes)
    if (!stored.success) return stored
    const imported = await importAssets(root)
    if (!imported.success) return imported
    let assets = imported.data.assets
    const sourcePath = target.data.split(sep).join("/")
    if (integrationNote !== undefined) {
      const current = await stateRead()
      if (!current.success) return current
      assets = current.data.assets.map((asset) =>
        asset.sourcePath === sourcePath ? { ...asset, integrationNote, updatedAt: nowRead().toISOString() } : asset,
      )
      const noted = await stateWrite({ ...current.data, assets })
      if (!noted.success) return noted
    }
    const published = await assetsPublish(assets)
    if (!published.success) return published
    const asset = published.data.assets.find((candidate) => candidate.sourcePath === sourcePath)
    if (asset === undefined) return resultErrorCreate("assetsLocalUpload", "The uploaded file was not imported")
    return { success: true, data: { asset, path: sourcePath } }
  }

  const list = async (
    listOptions: { className?: string; search?: string; folder?: string; include?: readonly string[] } = {},
  ) => {
    const state = await stateRead()
    if (!state.success) return state
    const assets = state.data.assets
      .filter((asset) => listOptions.className === undefined || asset.class === listOptions.className)
      .filter((asset) => listOptions.search === undefined || assetSearchMatch(asset, listOptions.search))
      .filter((asset) => listOptions.folder === undefined || asset.folders.join("/") === listOptions.folder)
      .toSorted(assetCompare)
    return { success: true as const, data: { assets } }
  }

  const show = async (reference: string) => {
    const state = await stateRead()
    if (!state.success) return state
    const asset = assetReferenceRead(state.data.assets, reference)
    if (asset === undefined) return resultErrorCreate("assetsLocalShow", `The asset ${reference} was not found`)
    return { success: true as const, data: asset }
  }

  const outputsList = async (reference: string) => {
    const asset = await show(reference)
    if (!asset.success) return asset
    return { success: true as const, data: { outputs: asset.data.outputs } }
  }

  const outputsAdd = async (reference: string, definition: LocalOutputDefinition) => {
    const state = await stateRead()
    if (!state.success) return state
    const index = state.data.assets.findIndex((asset) => assetReferenceMatch(asset, reference))
    const asset = state.data.assets[index]
    if (asset === undefined) return resultErrorCreate("assetsLocalOutputsAdd", `The asset ${reference} was not found`)
    if (asset.outputs.some((output) => output.key === definition.key))
      return resultErrorCreate("assetsLocalOutputsAdd", `The output ${definition.key} already exists`)
    if (definition.kind !== asset.class)
      return resultErrorCreate("assetsLocalOutputsAdd", "The output kind did not match the asset")
    const candidate = { ...asset, outputs: [...asset.outputs, localOutputPlaceholderCreate(definition, asset)] }
    const bytes = await assetSourceBytesRead(state.data, asset)
    if (!bytes.success) return bytes
    const processed = await processAsset(candidate, bytes.data, state.data.outputDir)
    if (!processed.success) return processed
    const assets = [...state.data.assets]
    assets[index] = processed.data
    const written = await stateWrite({ ...state.data, assets })
    if (!written.success) return written
    const published = await changedAssetPublish(asset.id)
    if (!published.success) return published
    const publishedAsset = published.data ?? processed.data
    return {
      success: true as const,
      data: { asset: publishedAsset, output: publishedAsset.outputs.find((output) => output.key === definition.key) },
    }
  }

  const outputsRemove = async (reference: string, outputKey: string) => {
    const state = await stateRead()
    if (!state.success) return state
    const index = state.data.assets.findIndex((asset) => assetReferenceMatch(asset, reference))
    const asset = state.data.assets[index]
    if (asset === undefined)
      return resultErrorCreate("assetsLocalOutputsRemove", `The asset ${reference} was not found`)
    if (asset.class === "image" && asset.outputs.length <= 1)
      return resultErrorCreate("assetsLocalOutputsRemove", "An image must retain one output")
    const output = asset.outputs.find((candidate) => candidate.key === outputKey)
    if (output === undefined)
      return resultErrorCreate("assetsLocalOutputsRemove", `The output ${outputKey} was not found`)
    const assets = [...state.data.assets]
    assets[index] = {
      ...asset,
      outputs: asset.outputs.filter((candidate) => candidate.key !== outputKey),
      unreferencedPaths: [...new Set([...asset.unreferencedPaths, output.path])],
      updatedAt: nowRead().toISOString(),
    }
    const written = await stateWrite({ ...state.data, assets })
    if (!written.success) return written
    await rm(join(state.data.outputDir, output.path), { force: true }).catch(() => undefined)
    return { success: true as const, data: { asset: assets[index] } }
  }

  const outputsSet = async (reference: string, definitions: readonly unknown[]) => {
    const parsed = definitions.map(localOutputDefinitionParse)
    const invalid = parsed.find((value) => !value.success)
    if (invalid !== undefined) return invalid
    const values = parsed.map((value) => (value.success ? value.data : undefined)).filter(isDefined)
    const state = await stateRead()
    if (!state.success) return state
    const index = state.data.assets.findIndex((asset) => assetReferenceMatch(asset, reference))
    const asset = state.data.assets[index]
    if (asset === undefined) return resultErrorCreate("assetsLocalOutputsSet", `The asset ${reference} was not found`)
    if (values.length === 0 || values.some((value) => value.kind !== asset.class))
      return resultErrorCreate("assetsLocalOutputsSet", "The replacement outputs were invalid")
    if (new Set(values.map((value) => value.key)).size !== values.length)
      return resultErrorCreate("assetsLocalOutputsSet", "Output keys must be unique")
    if (asset.class === "image" && values.length === 0)
      return resultErrorCreate("assetsLocalOutputsSet", "An image must retain one output")
    const candidate = { ...asset, outputs: values.map((value) => localOutputPlaceholderCreate(value, asset)) }
    const bytes = await assetSourceBytesRead(state.data, asset)
    if (!bytes.success) return bytes
    const processed = await processAsset(candidate, bytes.data, state.data.outputDir)
    if (!processed.success) return processed
    const stalePaths = asset.outputs
      .map((output) => output.path)
      .filter((path) => !processed.data.outputs.some((output) => output.path === path))
    const processedAsset = {
      ...processed.data,
      unreferencedPaths: [...new Set([...processed.data.unreferencedPaths, ...stalePaths])],
    }
    const assets = [...state.data.assets]
    assets[index] = processedAsset
    const written = await stateWrite({ ...state.data, assets })
    if (!written.success) return written
    for (const path of stalePaths) await rm(join(state.data.outputDir, path), { force: true }).catch(() => undefined)
    const published = await changedAssetPublish(asset.id)
    if (!published.success) return published
    return { success: true as const, data: { asset: published.data ?? processedAsset } }
  }

  const metadataSet = async (reference: string, alt: string) => metadataUpdate(reference, alt)

  const metadataUnset = async (reference: string) => metadataUpdate(reference, null)

  const metadataUpdate = async (reference: string, alt: string | null) => {
    const state = await stateRead()
    if (!state.success) return state
    const index = state.data.assets.findIndex((asset) => assetReferenceMatch(asset, reference))
    const asset = state.data.assets[index]
    if (asset === undefined) return resultErrorCreate("assetsLocalMetadata", `The asset ${reference} was not found`)
    if (asset.class !== "image") return resultErrorCreate("assetsLocalMetadata", "Only image alt metadata is supported")
    const updateImage = (metadata: MediaMetadata): MediaMetadata =>
      metadata.kind === "image" ? { ...metadata, alt } : metadata
    const assets = [...state.data.assets]
    assets[index] = {
      ...asset,
      metadata: updateImage(asset.metadata) as ImageMetadata,
      outputs: asset.outputs.map((output) => ({ ...output, metadata: updateImage(output.metadata) }) as LocalOutput),
      updatedAt: nowRead().toISOString(),
    }
    const written = await stateWrite({ ...state.data, assets })
    if (!written.success) return written
    return { success: true as const, data: { asset: assets[index] } }
  }

  const move = async (reference: string, targetPath: string) => {
    const target = localTargetPathRead(targetPath)
    if (!target.success) return target
    const state = await stateRead()
    if (!state.success) return state
    const index = state.data.assets.findIndex((asset) => assetReferenceMatch(asset, reference))
    const asset = state.data.assets[index]
    if (asset === undefined) return resultErrorCreate("assetsLocalMove", `The asset ${reference} was not found`)
    const destination = localMoveDestination(asset, target.data)
    if (!destination.success) return destination
    if (
      state.data.assets.some(
        (candidate, candidateIndex) =>
          candidateIndex !== index &&
          assetGroupIdentityKey(candidate) ===
            `${asset.class}|${destination.data.folders.join("/")}|${destination.data.basename}`,
      )
    )
      return resultErrorCreate("assetsLocalMove", "The destination already contains an asset")
    const sourceBytes = await assetSourceBytesRead(state.data, asset)
    if (!sourceBytes.success) return sourceBytes
    const sourcePath = destination.data.sourcePath
    const movedCandidate = {
      ...asset,
      folders: destination.data.folders,
      filename: destination.data.filename,
      basename: destination.data.basename,
      sourcePath,
      publishedAt: undefined,
    }
    const processed = await processAsset(movedCandidate, sourceBytes.data, state.data.outputDir)
    if (!processed.success) return processed
    const sourceStored = await sourceFileWrite(join(state.data.root, sourcePath), sourceBytes.data)
    if (!sourceStored.success) return sourceStored
    const moved: LocalAsset = {
      ...processed.data,
      unreferencedPaths: [...new Set([...asset.unreferencedPaths, ...processed.data.unreferencedPaths])],
      updatedAt: nowRead().toISOString(),
    }
    const assets = [...state.data.assets]
    assets[index] = moved
    const written = await stateWrite({ ...state.data, assets })
    if (!written.success) return written
    if (asset.sourcePath !== sourcePath)
      await rm(join(state.data.root, asset.sourcePath), { force: true }).catch(() => undefined)
    const published = await changedAssetPublish(asset.id)
    if (!published.success) return published
    return { success: true as const, data: { asset: published.data ?? moved } }
  }

  const remove = async (reference: string) => {
    const state = await stateRead()
    if (!state.success) return state
    const asset = assetReferenceRead(state.data.assets, reference)
    if (asset === undefined) return resultErrorCreate("assetsLocalDelete", `The asset ${reference} was not found`)
    if (outputPublisher?.removeOutput !== undefined) {
      for (const path of [...asset.outputs.map((output) => output.path), ...asset.unreferencedPaths]) {
        const removed = await outputPublisher.removeOutput(path)
        if (!removed.success) return removed
      }
    }
    if (outputPublisher?.removeSource !== undefined) {
      const removed = await outputPublisher.removeSource(asset.sourceSha256)
      if (!removed.success) return removed
    }
    const assets = state.data.assets.filter((candidate) => candidate.id !== asset.id)
    const written = await stateWrite({ ...state.data, assets })
    if (!written.success) return written
    for (const output of asset.outputs)
      await rm(join(state.data.outputDir, output.path), { force: true }).catch(() => undefined)
    for (const path of asset.unreferencedPaths)
      await rm(join(state.data.outputDir, path), { force: true }).catch(() => undefined)
    await rm(join(state.data.root, asset.sourcePath), { force: true }).catch(() => undefined)
    return { success: true as const, data: { deleted: asset.id } }
  }

  const lists = async (listOptions: { files: ListFiles; check: boolean; write: boolean }) => {
    const state = await stateRead()
    if (!state.success) return state
    const entries = state.data.assets.flatMap((asset) =>
      asset.outputs.map((output) => ({
        class: asset.class,
        folders: asset.folders,
        basename: asset.basename,
        key: output.key,
        path: output.path,
        mediaType: output.mediaType,
        metadata: output.metadata,
      })),
    )
    const rendered = catalogListsRender(entries)
    if (!rendered.success) return rendered
    if (listOptions.check) {
      const matches = await catalogListsCheck(listOptions.files, rendered.data)
      if (!matches.success) return matches
      return {
        success: true as const,
        data: { digest: rendered.data.digest, files: listOptions.files, matches: matches.data },
      }
    }
    if (listOptions.write) {
      const written = await catalogListsWrite(listOptions.files, rendered.data)
      if (!written.success) return written
      return { success: true as const, data: { digest: rendered.data.digest, files: listOptions.files, written: true } }
    }
    return {
      success: true as const,
      data: { digest: rendered.data.digest, files: listOptions.files, rendered: rendered.data },
    }
  }

  const references = async (locations: readonly string[] = [], generatedListPaths: readonly string[] = []) => {
    const state = await stateRead()
    if (!state.success) return state
    const assets = state.data.assets.flatMap((asset) =>
      asset.outputs.map((output) => ({
        class: asset.class,
        key: assetIdentifierCreate(asset.folders, asset.basename, output.key),
        path: output.path,
      })),
    )
    return staticReferenceCountsCreate({
      root,
      assets,
      locations,
      generatedListPaths: [
        "src/app/assets/imageList.ts",
        "src/app/assets/videoList.ts",
        "src/app/assets/fontList.ts",
        ...generatedListPaths,
      ],
    })
  }

  const doctor = async () => {
    const checks: Array<{ name: string; status: "ok" | "failed"; message?: string }> = []
    const rootCheck = await directoryCheck(root)
    checks.push(
      rootCheck.success
        ? { name: "root", status: "ok" }
        : { name: "root", status: "failed", message: rootCheck.errorMessage },
    )
    const state = await stateRead()
    checks.push(
      state.success
        ? { name: "state", status: "ok" }
        : { name: "state", status: "failed", message: state.errorMessage },
    )
    if (state.success) {
      const outputCheck = await directoryCheck(state.data.outputDir)
      checks.push(
        outputCheck.success
          ? { name: "outputs", status: "ok" }
          : { name: "outputs", status: "failed", message: outputCheck.errorMessage },
      )
      for (const asset of state.data.assets) {
        if (asset.publishedAt === undefined) {
          const source = await fileExists(join(state.data.root, asset.sourcePath))
          if (!source)
            checks.push({ name: `source:${asset.id}`, status: "failed", message: `Missing ${asset.sourcePath}` })
          for (const output of asset.outputs) {
            const valid = await immutableFileMatches(join(state.data.outputDir, output.path), output.sha256)
            if (!valid)
              checks.push({
                name: `output:${output.path}`,
                status: "failed",
                message: "Output bytes do not match state",
              })
          }
        }
      }
    }
    if (remoteRequired || outputPublisher !== undefined) {
      if (outputPublisher === undefined) {
        checks.push({ name: "r2", status: "failed", message: "R2 publication is not configured" })
      } else {
        const remote = await outputPublisher.probe()
        checks.push(
          remote.success
            ? { name: "r2", status: "ok", message: `R2 responded with ${remote.data.status}` }
            : { name: "r2", status: "failed", message: remote.errorMessage },
        )
      }
    }
    return {
      success: true as const,
      data: {
        checks,
        ok: checks.every((check) => check.status === "ok"),
        remoteAccess: outputPublisher === undefined ? ("disabled" as const) : ("configured" as const),
      },
    }
  }

  const assetsPublish = async (assets: readonly LocalAsset[]): Promise<Result<{ assets: LocalAsset[] }>> => {
    if (outputPublisher === undefined)
      return resultErrorCreate(
        "assetsLocalPublish",
        "Local publication requires R2 credentials, an R2 endpoint, and an R2 bucket",
      )
    const state = await stateRead()
    if (!state.success) return state
    const publishedAt = nowRead().toISOString()
    for (const asset of assets) {
      if (asset.publishedAt !== undefined) continue
      const sourceBytes = await assetSourceBytesRead(state.data, asset)
      if (!sourceBytes.success) return sourceBytes
      if (outputPublisher.publishSource !== undefined) {
        const source = await outputPublisher.publishSource({
          bytes: sourceBytes.data,
          mediaType: asset.sourceMediaType,
          sha256: asset.sourceSha256,
        })
        if (!source.success) return source
      }
      for (const output of asset.outputs) {
        const bytes = await readFile(join(state.data.outputDir, output.path)).catch(() => null)
        if (bytes === null) return resultErrorCreate("assetsLocalPublish", `The output ${output.path} was missing`)
        const published = await outputPublisher.publish({
          path: output.path,
          bytes: new Uint8Array(bytes),
          mediaType: output.mediaType,
          sha256: output.sha256,
        })
        if (!published.success) return published
      }
    }
    const publishedAssets = assets.map((asset) => (asset.publishedAt === undefined ? { ...asset, publishedAt } : asset))
    const written = await stateWrite({ ...state.data, assets: publishedAssets })
    if (!written.success) return written
    for (const asset of publishedAssets) {
      if (asset.publishedAt !== publishedAt) continue
      const cleaned = await localPublishedFilesRemove(state.data, asset)
      if (!cleaned.success) return cleaned
    }
    return { success: true, data: { assets: publishedAssets } }
  }

  const changedAssetPublish = async (assetId: string): Promise<Result<LocalAsset | null>> => {
    if (outputPublisher === undefined) return { success: true, data: null }
    const current = await stateRead()
    if (!current.success) return current
    const published = await assetsPublish(current.data.assets)
    if (!published.success) return published
    return { success: true, data: published.data.assets.find((asset) => asset.id === assetId) ?? null }
  }

  const assetSourceBytesRead = async (state: LocalAssetState, asset: LocalAsset): Promise<Result<Uint8Array>> => {
    const local = await sourceBytesRead(state.root, asset.sourcePath)
    if (local.success) return local
    if (outputPublisher?.readSource === undefined) return local
    const remote = await outputPublisher.readSource(asset.sourceSha256)
    if (!remote.success) return remote
    if (remote.data === null) return local
    return { success: true, data: remote.data }
  }

  return {
    doctor,
    importAssets,
    list,
    lists,
    metadataSet,
    metadataUnset,
    move,
    outputsAdd,
    outputsList,
    outputsRemove,
    outputsSet,
    process,
    publish: assetsPublish,
    references,
    remove,
    show,
    upload,
  }

  function stateCreate(): LocalAssetState {
    return {
      schema: "assets.local-state.v1",
      root,
      outputDir: configuredOutputDir ?? join(root, "public"),
      assets: [],
    }
  }
}

type ListFiles = { imageListPath: string; videoListPath: string; fontListPath: string }

async function localScanCreate(root: string, showAiLabel?: boolean): Promise<Result<LocalScan>> {
  const files = await sourceFilesRead(root)
  if (!files.success) return files
  const sidecars = new Map<string, { md?: string; txt?: string }>()
  for (const file of files.data) {
    const extension = extname(file.relativePath).toLowerCase()
    if (!sidecarExtensions.has(extension)) continue
    const parsed = sourcePathParse(file.relativePath, true)
    if (!parsed.success || parsed.data === null) continue
    const key = assetGroupIdentityKey(parsed.data)
    const current = sidecars.get(key) ?? {}
    try {
      current[extension === ".txt" ? "txt" : "md"] = normalizeSidecar(await readFile(file.absolutePath, "utf8"))
    } catch {
      continue
    }
    sidecars.set(key, current)
  }
  const groups = new Map<string, LocalAssetGroup>()
  const conflicts: LocalConflict[] = []
  for (const file of files.data) {
    const extension = extname(file.relativePath).toLowerCase()
    if (sidecarExtensions.has(extension)) continue
    const parsed = sourcePathParse(file.relativePath)
    if (!parsed.success) {
      conflicts.push(conflictCreate(file.relativePath, "invalid_path", parsed.errorMessage))
      continue
    }
    if (parsed.data === null) continue
    const supported =
      parsed.data.class === "image"
        ? imageExtensions.has(extension)
        : parsed.data.class === "video"
          ? videoExtensions.has(extension)
          : fontExtensions.has(extension)
    if (!supported) continue
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await readFile(file.absolutePath))
    } catch (error) {
      conflicts.push(conflictCreate(file.relativePath, "source_read_failed", errorMessageCreate(error)))
      continue
    }
    const sourceSha256 = contentSha256Create(bytes)
    const identity = assetGroupIdentityKey(parsed.data)
    const sidecar = sidecars.get(identity)
    const alt =
      parsed.data.class === "image"
        ? (sidecar?.txt ?? sidecar?.md ?? prettifyBasename(parsed.data.basename))
        : undefined
    const candidate: LocalAssetCandidate = {
      ...parsed.data,
      sourcePath: file.relativePath,
      sourceBytes: bytes,
      sourceSha256,
      sourceMediaType: mediaTypeRead(parsed.data.class, extension),
      output: outputDefinitionCreate(parsed.data, extension, showAiLabel),
      ...(alt === undefined ? {} : { alt }),
    }
    const current = groups.get(identity)
    if (current === undefined) {
      groups.set(identity, {
        class: candidate.class,
        folders: candidate.folders,
        filename: candidate.filename,
        basename: candidate.basename,
        sourcePath: candidate.sourcePath,
        sourceBytes: candidate.sourceBytes,
        sourceSha256: candidate.sourceSha256,
        sourceMediaType: candidate.sourceMediaType,
        ...(candidate.alt === undefined ? {} : { alt: candidate.alt }),
        ...(candidate.aiProvenance === undefined ? {} : { aiProvenance: candidate.aiProvenance }),
        outputs: [candidate.output],
      })
      continue
    }
    if (current.sourceSha256 !== candidate.sourceSha256) {
      conflicts.push(
        conflictCreate(
          current.sourcePath,
          "source_checksum_conflict",
          "Logical asset candidates have different source bytes",
          [current.sourcePath, candidate.sourcePath],
        ),
      )
      continue
    }
    const duplicate = current.outputs.find((output) => output.key === candidate.output.key)
    if (duplicate !== undefined) {
      if (JSON.stringify(duplicate) !== JSON.stringify(candidate.output))
        conflicts.push(
          conflictCreate(
            candidate.sourcePath,
            "output_definition_conflict",
            `The output key ${candidate.output.key} has incompatible definitions`,
          ),
        )
      continue
    }
    current.outputs.push(candidate.output)
    current.outputs.sort((left, right) => left.key.localeCompare(right.key))
    current.alt ??= candidate.alt
    current.aiProvenance ??= candidate.aiProvenance
  }
  return {
    success: true,
    data: {
      groups: [...groups.values()].sort((left, right) =>
        assetGroupIdentityKey(left).localeCompare(assetGroupIdentityKey(right)),
      ),
      conflicts,
    },
  }
}

async function sourceFilesRead(root: string): Promise<Result<Array<{ absolutePath: string; relativePath: string }>>> {
  const files: Array<{ absolutePath: string; relativePath: string }> = []
  try {
    for (const directory of ["images", "videos", "fonts"]) {
      const path = join(root, directory)
      if (await fileExists(path)) await sourceFilesCollect(root, path, files)
    }
  } catch (error) {
    return resultErrorCreate("assetsLocalSourceScan", errorMessageCreate(error))
  }
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  return { success: true, data: files }
}

async function sourceFilesCollect(
  root: string,
  directory: string,
  files: Array<{ absolutePath: string; relativePath: string }>,
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await sourceFilesCollect(root, path, files)
      continue
    }
    if (entry.isFile()) files.push({ absolutePath: path, relativePath: relative(root, path).split(sep).join("/") })
  }
}

function sourcePathParse(path: string, allowSidecar = false): Result<ParsedSource | null> {
  const segments = path.split("/")
  const className =
    segments[0] === "images" ? "image" : segments[0] === "videos" ? "video" : segments[0] === "fonts" ? "font" : null
  if (className === null || segments.length < 2) return { success: true, data: null }
  const filename = segments.at(-1)
  if (filename === undefined) return resultErrorCreate("assetsLocalSourcePathParse", "The source filename is missing")
  const parsedFilename = v.safeParse(assetFilenameSchema, filename)
  if (!parsedFilename.success)
    return resultErrorCreate("assetsLocalSourcePathParse", "The source filename is invalid", path)
  const folderSegments = segments.slice(1, -1)
  const transforms: Array<{ index: number; value: LocalTransform }> = []
  if (className === "image") {
    for (const [index, segment] of folderSegments.entries()) {
      const parsed = legacyTransformParse(segment)
      if (!parsed.success) return parsed
      if (parsed.data !== null) transforms.push({ index, value: parsed.data })
    }
    if (transforms.length === 0 && !allowSidecar)
      return resultErrorCreate("assetsLocalSourcePathParse", "Image files must be inside a transform folder", path)
    if (transforms.length > 1)
      return resultErrorCreate(
        "assetsLocalSourcePathParse",
        "Nested or multiple transform folders are not supported",
        path,
      )
  }
  const folders = folderSegments.filter((_segment, index) => !transforms.some((transform) => transform.index === index))
  const parsedFolders = v.safeParse(foldersSchema, folders)
  if (!parsedFolders.success)
    return resultErrorCreate("assetsLocalSourcePathParse", "The logical folder path is invalid", path)
  const basename = assetBasenameCreate(parsedFilename.output)
  const aiProvenance =
    aiProvenanceRead(basename) ??
    (transforms[0]?.value.aiProvenance === null ? undefined : transforms[0]?.value.aiProvenance)
  return {
    success: true,
    data: {
      class: className,
      folders: parsedFolders.output,
      filename: parsedFilename.output,
      basename,
      ...(aiProvenance === undefined ? {} : { aiProvenance }),
      ...(transforms[0] === undefined ? {} : { transform: transforms[0].value }),
    },
  }
}

function outputDefinitionCreate(
  parsed: ParsedSource,
  _extension: string,
  showAiLabel?: boolean,
): LocalOutputDefinition {
  if (parsed.class === "image") {
    const transform = parsed.transform
    if (transform === undefined)
      return {
        kind: "image",
        key: "default",
        width: 1,
        height: 1,
        format: "webp",
        ...(showAiLabel === undefined ? {} : { showAiLabel }),
      }
    return {
      kind: "image",
      key: transform.normalized,
      width: transform.width,
      height: transform.height,
      format: transform.format,
      ...(showAiLabel === undefined ? {} : { showAiLabel }),
    }
  }
  if (parsed.class === "video") return { kind: "video", key: "default" }
  return { kind: "font", key: "default", format: "woff2" }
}

function localAssetDraftCreate(
  group: LocalAssetGroup,
  previous: LocalAsset | undefined,
  root: string,
  _outputDir: string,
  nowRead: () => Date,
): LocalAsset {
  const createdAt = previous?.createdAt ?? nowRead().toISOString()
  const metadata = previous?.metadata ?? fallbackMetadataCreate(group)
  const imageMetadata =
    metadata.kind === "image"
      ? { ...metadata, alt: group.alt ?? metadata.alt, aiProvenance: group.aiProvenance ?? metadata.aiProvenance }
      : metadata
  return {
    id:
      previous?.id ??
      `local-asset-${canonicalJsonDigest({ root, class: group.class, folders: group.folders, basename: group.basename }).slice(0, 32)}`,
    class: group.class,
    folders: group.folders,
    filename: group.filename,
    basename: group.basename,
    sourcePath: group.sourcePath,
    sourceSha256: group.sourceSha256 as LocalAsset["sourceSha256"],
    sourceByteSize: group.sourceBytes.byteLength,
    sourceMediaType: group.sourceMediaType as LocalAsset["sourceMediaType"],
    metadata: imageMetadata,
    ...(previous?.integrationNote === undefined ? {} : { integrationNote: previous.integrationNote }),
    outputs: group.outputs.map((output) => localOutputPlaceholderCreate(output, { class: group.class } as LocalAsset)),
    unreferencedPaths: previous?.unreferencedPaths ?? [],
    createdAt,
    updatedAt: nowRead().toISOString(),
  }
}

function localOutputPlaceholderCreate(
  definition: LocalOutputDefinition,
  asset: Pick<LocalAsset, "class">,
): LocalOutput {
  const base = {
    ...definition,
    path: "pending",
    sha256: "0".repeat(64),
    byteSize: 0,
    mediaType: asset.class === "image" ? "image/webp" : asset.class === "video" ? "video/mp4" : "font/woff2",
    metadata: fallbackMetadataCreate({ class: asset.class, basename: "asset" }),
  }
  return base as LocalOutput
}

function fallbackMetadataCreate(input: { class: "image" | "video" | "font"; basename: string }): MediaMetadata {
  if (input.class === "image")
    return {
      kind: "image",
      width: 1,
      height: 1,
      format: "webp",
      colorSpace: "srgb",
      alpha: false,
      orientationApplied: true,
      frameCount: 1,
      animated: false,
      alt: prettifyBasename(input.basename),
      aiProvenance: null,
    }
  if (input.class === "video")
    return {
      kind: "video",
      width: 1,
      height: 1,
      durationSeconds: 0,
      frameRate: 0,
      container: "unknown",
      videoCodec: "unknown",
      audioCodec: null,
      streams: 1,
      bitrate: null,
    }
  return {
    kind: "font",
    family: input.basename,
    style: "normal",
    weight: 400,
    width: 5,
    variableAxes: [],
    glyphCount: 0,
    unicodeRanges: [],
    format: "woff2",
  }
}

async function outputProcess(
  asset: LocalAsset,
  sourceBytes: Uint8Array,
  definition: LocalOutputDefinition,
): Promise<
  Result<{
    bytes: Uint8Array
    sha256: string
    mediaType: LocalOutput["mediaType"]
    metadata: MediaMetadata
    extension: string
  }>
> {
  if (definition.kind === "image") {
    const result = await imageProcess({
      sourceBytes: sourceBytes as Uint8Array<ArrayBuffer>,
      width: definition.width,
      height: definition.height,
      format: definition.format,
      quality: definition.quality,
      alt: asset.metadata.kind === "image" ? asset.metadata.alt : null,
      aiProvenance: asset.metadata.kind === "image" ? asset.metadata.aiProvenance : null,
      showAiLabel: definition.showAiLabel,
    })
    if (!result.success) return result
    return {
      success: true,
      data: {
        bytes: result.data.bytes,
        sha256: contentSha256Create(result.data.bytes),
        mediaType: imageMediaTypeRead(definition.format),
        metadata: result.data.metadata,
        extension: definition.format,
      },
    }
  }
  if (definition.kind === "video") {
    const result = await videoProcess({
      sourceBytes: sourceBytes as Uint8Array<ArrayBuffer>,
      sourceName: asset.filename,
    })
    if (!result.success) return result
    return {
      success: true,
      data: {
        bytes: result.data.bytes,
        sha256: contentSha256Create(result.data.bytes),
        mediaType: asset.sourceMediaType,
        metadata: result.data.metadata,
        extension: videoExtensionRead(asset.filename),
      },
    }
  }
  const result = fontProcess({
    sourceBytes: sourceBytes as Uint8Array<ArrayBuffer>,
    sourceName: asset.filename,
    outputFormat: definition.format,
  })
  if (!result.success) return result
  return {
    success: true,
    data: {
      bytes: result.data.bytes,
      sha256: contentSha256Create(result.data.bytes),
      mediaType: "font/woff2",
      metadata: result.data.metadata,
      extension: "woff2",
    },
  }
}

function localOutputDefinitionRead(output: LocalOutput): Result<LocalOutputDefinition> {
  return localOutputDefinitionParse(output)
}

function localOutputDefinitionParse(value: unknown): Result<LocalOutputDefinition> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return resultErrorCreate("assetsLocalOutputDefinition", "The output definition was invalid")
  const record = value as Record<string, unknown>
  const key = typeof record.key === "string" && record.key.length > 0 ? record.key : undefined
  const kind = record.kind
  if (key === undefined || (kind !== "image" && kind !== "video" && kind !== "font"))
    return resultErrorCreate("assetsLocalOutputDefinition", "The output definition was invalid")
  if (kind === "image") {
    const width = record.width
    const height = record.height
    const format = v.safeParse(outputFormatSchema, record.format)
    if (
      typeof width !== "number" ||
      !Number.isInteger(width) ||
      width < 1 ||
      typeof height !== "number" ||
      !Number.isInteger(height) ||
      height < 1 ||
      !format.success
    )
      return resultErrorCreate("assetsLocalOutputDefinition", "The image output definition was invalid")
    return {
      success: true,
      data: {
        kind,
        key,
        width,
        height,
        format: format.output,
        ...(typeof record.quality === "number" ? { quality: record.quality } : {}),
        ...(typeof record.showAiLabel === "boolean" ? { showAiLabel: record.showAiLabel } : {}),
      },
    }
  }
  if (kind === "video") return { success: true, data: { kind, key } }
  const format = v.safeParse(fontOutputFormatSchema, record.format ?? "woff2")
  if (!format.success) return resultErrorCreate("assetsLocalOutputDefinition", "The font output definition was invalid")
  return { success: true, data: { kind, key, format: format.output } }
}

function assetReferenceRead(assets: readonly LocalAsset[], reference: string): LocalAsset | undefined {
  return assets.find((asset) => assetReferenceMatch(asset, reference))
}

function assetReferenceMatch(asset: LocalAsset, reference: string): boolean {
  return (
    asset.id === reference ||
    asset.sourcePath === reference ||
    asset.outputs.some((output) => assetIdentifierCreate(asset.folders, asset.basename, output.key) === reference)
  )
}

function assetIdentityKey(asset: LocalAsset): string {
  return assetGroupIdentityKey(asset)
}

function assetGroupIdentityKey(
  value:
    | Pick<LocalAssetGroup, "class" | "folders" | "basename">
    | Pick<LocalAsset, "class" | "folders" | "basename">
    | { class: string; folders: readonly string[]; basename: string },
): string {
  return `${value.class}|${value.folders.join("/")}|${value.basename}`
}

function assetCompare(
  left: Pick<LocalAsset, "class" | "folders" | "basename" | "id">,
  right: Pick<LocalAsset, "class" | "folders" | "basename" | "id">,
): number {
  const leftKey = `${left.class}|${left.folders.join("/")}|${left.basename}|${left.id}`
  const rightKey = `${right.class}|${right.folders.join("/")}|${right.basename}|${right.id}`
  return leftKey.localeCompare(rightKey)
}

function assetSearchMatch(asset: LocalAsset, search: string): boolean {
  const value = `${asset.class} ${asset.sourcePath} ${asset.folders.join("/")} ${asset.basename}`.toLocaleLowerCase()
  return value.includes(search.toLocaleLowerCase())
}

function localTargetPathRead(target: string): Result<string> {
  if (target.length === 0 || target.startsWith("/") || target.includes("\\"))
    return resultErrorCreate("assetsLocalTargetPath", "The target path was invalid")
  const segments = target.split("/")
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === ".."))
    return resultErrorCreate("assetsLocalTargetPath", "The target path was invalid")
  return { success: true, data: target }
}

function localMoveDestination(
  asset: LocalAsset,
  target: string,
): Result<{ folders: Folders; filename: string; basename: string; sourcePath: string }> {
  const segments = target.split("/")
  const maybeClass = segments[0]
  const expectedClass = asset.class === "image" ? "images" : `${asset.class}s`
  const logical = maybeClass === expectedClass ? segments.slice(1) : segments
  const filename = logical.pop()
  if (filename === undefined) return resultErrorCreate("assetsLocalMove", "The target filename was missing")
  const parsedFilename = v.safeParse(assetFilenameSchema, filename)
  const folders = v.safeParse(foldersSchema, logical)
  if (!parsedFilename.success || !folders.success)
    return resultErrorCreate("assetsLocalMove", "The target path was invalid")
  const basenameValue = assetBasenameCreate(parsedFilename.output)
  const sourceSegments = asset.class === "image" ? imageSourceSegments(asset.sourcePath) : []
  let transform: string | undefined
  for (const segment of sourceSegments) {
    const parsed = legacyTransformParse(segment)
    if (parsed.success && parsed.data !== null) {
      transform = segment
      break
    }
  }
  const sourcePath = [
    expectedClass,
    ...(transform === undefined ? [] : [transform]),
    ...folders.output,
    parsedFilename.output,
  ].join("/")
  return {
    success: true,
    data: { folders: folders.output, filename: parsedFilename.output, basename: basenameValue, sourcePath },
  }
}

function imageSourceSegments(sourcePath: string): string[] {
  return sourcePath.split("/").slice(1, -1)
}

function imageMediaTypeRead(format: OutputFormat): "image/jpeg" | "image/png" | "image/webp" | "image/avif" {
  return format === "jpg" ? "image/jpeg" : `image/${format}`
}

function mediaTypeRead(className: "image" | "video" | "font", extension: string): string {
  if (className === "image")
    return extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : extension === ".png"
        ? "image/png"
        : extension === ".avif"
          ? "image/avif"
          : extension === ".gif"
            ? "image/gif"
            : extension === ".tiff"
              ? "image/tiff"
              : extension === ".svg"
                ? "image/svg+xml"
                : "image/webp"
  if (className === "video")
    return extension === ".mov" ? "video/quicktime" : extension === ".webm" ? "video/webm" : "video/mp4"
  return extension === ".ttf"
    ? "font/ttf"
    : extension === ".otf"
      ? "font/otf"
      : extension === ".woff"
        ? "font/woff"
        : "font/woff2"
}

function videoExtensionRead(filename: string): string {
  const extension = extname(filename).slice(1).toLowerCase()
  return extension === "m4v" ? "mp4" : extension || "mp4"
}

function aiProvenanceRead(basenameValue: string): "generated" | "enhanced" | undefined {
  if (/(?:-|_)ai-generated$/iu.test(basenameValue)) return "generated"
  if (
    /(?:-|_)ai-(?:modified|enhanced)$/iu.test(basenameValue) ||
    /(?:-|_)ai_(?:modified|enhanced)$/iu.test(basenameValue)
  )
    return "enhanced"
  return undefined
}

function prettifyBasename(value: string): string {
  return value
    .replace(/(?:-ai-(?:generated|modified|enhanced)|_ai_(?:generated|modified|enhanced))$/iu, "")
    .replace(/[-_]/gu, " ")
}

function normalizeSidecar(value: string): string {
  return value.replace(/\s+/gu, " ").trim()
}

function conflictCreate(path: string, code: string, message: string, candidates?: string[]): LocalConflict {
  return { path, code, message, ...(candidates === undefined ? {} : { candidates: [...new Set(candidates)].sort() }) }
}

function conflictCompare(left: LocalConflict, right: LocalConflict): number {
  return `${left.path}|${left.code}|${left.message}`.localeCompare(`${right.path}|${right.code}|${right.message}`)
}

async function sourceBytesRead(root: string, sourcePath: string): Promise<Result<Uint8Array>> {
  const absolute = resolve(root, sourcePath)
  if (!pathWithin(root, absolute)) return resultErrorCreate("assetsLocalSourceRead", "The source path escaped the root")
  try {
    return { success: true, data: new Uint8Array(await readFile(absolute)) }
  } catch (error) {
    return resultErrorCreate("assetsLocalSourceRead", `Could not read ${sourcePath}`, errorMessageCreate(error))
  }
}

async function atomicJsonWrite(filePath: string, value: unknown, op: string): Promise<Result<undefined>> {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  try {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(temporaryPath, `${canonicalJsonStringify(value)}\n`, { encoding: "utf8", mode: 0o600 })
    await rename(temporaryPath, filePath)
    return { success: true, data: undefined }
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    return resultErrorCreate(op, errorMessageCreate(error), { filePath })
  }
}

async function sourceFileWrite(filePath: string, bytes: Uint8Array): Promise<Result<undefined>> {
  try {
    await mkdir(dirname(filePath), { recursive: true })
    const existing = await readFile(filePath).catch(() => null)
    if (existing !== null) {
      if (contentSha256Create(existing) === contentSha256Create(bytes)) return { success: true, data: undefined }
      return resultErrorCreate("assetsLocalSourceWrite", `Refusing to replace ${filePath}`)
    }
    const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`
    await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 })
    await rename(temporaryPath, filePath)
    return { success: true, data: undefined }
  } catch (error) {
    return resultErrorCreate("assetsLocalSourceWrite", errorMessageCreate(error), { filePath })
  }
}

async function localPublishedFilesRemove(state: LocalAssetState, asset: LocalAsset): Promise<Result<undefined>> {
  const op = "assetsLocalPublishedFilesRemove"
  try {
    await rm(join(state.root, asset.sourcePath), { force: true })
    for (const output of asset.outputs) await rm(join(state.outputDir, output.path), { force: true })
    for (const path of asset.unreferencedPaths) await rm(join(state.outputDir, path), { force: true })
    return { success: true, data: undefined }
  } catch (error) {
    return resultErrorCreate(op, errorMessageCreate(error), { assetId: asset.id })
  }
}

async function immutableFileWrite(filePath: string, bytes: Uint8Array, sha256: string): Promise<Result<undefined>> {
  try {
    await mkdir(dirname(filePath), { recursive: true })
    const existing = await readFile(filePath).catch(() => null)
    if (existing !== null) {
      if (contentSha256Create(existing) === sha256) return { success: true, data: undefined }
      return resultErrorCreate(
        "assetsLocalImmutableWrite",
        `Immutable output already exists with different bytes: ${filePath}`,
      )
    }
    const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`
    await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o644 })
    try {
      await link(temporaryPath, filePath)
    } catch (error) {
      if (!isErrorCode(error, "EEXIST")) throw error
      const raced = await readFile(filePath)
      if (contentSha256Create(raced) !== sha256)
        return resultErrorCreate("assetsLocalImmutableWrite", `Immutable output changed during write: ${filePath}`)
    }
    await unlink(temporaryPath).catch(() => undefined)
    return { success: true, data: undefined }
  } catch (error) {
    return resultErrorCreate("assetsLocalImmutableWrite", errorMessageCreate(error), { filePath })
  }
}

async function immutableFileMatches(filePath: string, sha256: string): Promise<boolean> {
  try {
    return contentSha256Create(await readFile(filePath)) === sha256
  } catch {
    return false
  }
}

async function directoryCheck(path: string, create = false): Promise<Result<undefined>> {
  try {
    if (create) await mkdir(path, { recursive: true })
    const value = await stat(path)
    if (!value.isDirectory()) return resultErrorCreate("assetsLocalDoctor", `${path} is not a directory`)
    return { success: true, data: undefined }
  } catch (error) {
    return resultErrorCreate("assetsLocalDoctor", errorMessageCreate(error), { path })
  }
}

function pathWithin(root: string, path: string): boolean {
  const remainder = relative(resolve(root), resolve(path))
  return remainder === "" || (!remainder.startsWith(`..${sep}`) && remainder !== ".." && !remainder.startsWith(sep))
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile() || (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code)
}

function errorMessageCreate(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
