#!/usr/bin/env bun
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import * as v from "valibot"

import { apiFailureEnvelopeCreate } from "../api/apiFailureEnvelopeCreate.js"
import { apiSuccessEnvelopeCreate } from "../api/apiSuccessEnvelopeCreate.js"
import { jsonEnvelopeStringify } from "../api/jsonEnvelopeStringify.js"
import { assetsApiClientCreate } from "../api-client/assetsApiClientCreate.js"
import { assetFilenameSchema } from "../asset/assetFilenameSchema.js"
import { assetIdentifierCreate } from "../asset/assetIdentifierCreate.js"
import {
  assetDiffClassify,
  assetDiffStatuses,
  type AssetDiff,
  type AssetDiffEntry,
  type AssetDiffStatus,
} from "../asset-cli/assetDiffClassify.js"
import { assetFileFingerprint, type AssetFileFingerprint } from "../asset-cli/assetFileFingerprint.js"
import { localAssetManifestLoad } from "../asset-cli/localAssetManifestLoad.js"
import {
  remoteAssetHistoryManifestLoad,
  type RemoteAssetHistoryManifest,
} from "../asset-cli/remoteAssetHistoryManifestLoad.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import { catalogListsCheck } from "../catalog/catalogListsCheck.js"
import { catalogListsWrite } from "../catalog/catalogListsWrite.js"
import { contentSha256Create } from "../schemas/contentSha256Create.js"
import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { projectSourceConfigurationOverridesParse } from "../config/projectSourceConfigurationOverridesParse.js"
import { projectSourceConfigurationRead } from "../config/projectSourceConfigurationRead.js"
import { packageVersion } from "../packageVersion.js"
import type { ProjectSettings } from "../project/projectSettingsSchema.js"
import { projectSettingsUpdateSchema, type ProjectSettingsUpdate } from "../project/projectSettingsUpdateSchema.js"

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>

export type AssetsCliOptions = {
  env?: NodeJS.ProcessEnv
  fetcher?: Fetcher
  sleep?: (milliseconds: number) => Promise<void>
  stdout?: (text: string) => void
  stderr?: (text: string) => void
  stdinRead?: () => Promise<string>
}

type CliConfig = {
  apiUrl?: string
  project?: string
  environment?: string
}

type ProjectEnvironmentSelection = "configured" | "project-default"

type CliSession = {
  accessToken: string
  tokenType?: string
  expiresAt?: number
}

type ParsedCommand = {
  command: string
  subcommand?: string
  positionals: string[]
  options: Record<string, string | true>
  json: boolean
}

type CommandOutput = {
  result: Result<unknown>
  exitCode?: number
  humanOutput?: string
}

type AssetsApiClient = Extract<ReturnType<typeof assetsApiClientCreate>, { success: true }>["data"]

const configSchema = v.strictObject({
  apiUrl: v.optional(v.pipe(v.string(), v.url())),
  project: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(128))),
  environment: v.optional(environmentNameSchema),
})

const sessionSchema = v.strictObject({
  accessToken: v.pipe(v.string(), v.minLength(1)),
  tokenType: v.optional(v.pipe(v.string(), v.minLength(1))),
  expiresAt: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
})

const optionNames = new Set([
  "alt",
  "api-url",
  "atomicity",
  "class",
  "config",
  "document-list",
  "dir",
  "document-dir",
  "environment",
  "file",
  "folder",
  "font-list",
  "font-dir",
  "format",
  "height",
  "image-dir",
  "image-list",
  "include",
  "integration-note",
  "key",
  "kind",
  "limit",
  "note",
  "output-dir",
  "path",
  "poll-interval",
  "project",
  "quality",
  "r2-bucket",
  "r2-prefix",
  "public-base-url",
  "search",
  "session",
  "status",
  "token",
  "to",
  "video-dir",
  "video-list",
  "width",
])

const flagNames = new Set([
  "check",
  "dry-run",
  "help",
  "json",
  "no-document-dir",
  "no-font-dir",
  "no-image-dir",
  "no-video-dir",
  "no-wait",
  "show-ai-label",
  "token-stdin",
  "wait",
  "write",
  "delete",
  "version",
])

const diffSourceDirectoryOptionNames = new Set([
  "document-dir",
  "font-dir",
  "image-dir",
  "no-document-dir",
  "no-font-dir",
  "no-image-dir",
  "no-video-dir",
  "video-dir",
])

const commandHelp = {
  commands: [
    "auth login",
    "doctor --environment <development|production>",
    "diff [root]",
    "upload-all [root] --integration-note <text>",
    "import <root>",
    "upload <file> --path <folder/file> --integration-note <text>",
    "list",
    "show <asset-key>",
    "outputs list|add|remove|set <asset-key>",
    "metadata set|unset <asset-key>",
    "settings read [--project <id-or-name>] [--environment <development|production>]",
    "settings update [--project <id-or-name>] --environment <development|production> [--r2-bucket <bucket>] [--r2-prefix <prefix>] [--public-base-url <url>]",
    "move <asset-key> --to <path>",
    "delete <asset-key>",
    "lists [--check] [--dir <directory>]",
  ],
  diff: {
    root: "Default: .",
    sourceDirectories: [
      "image: ./images, --image-dir <directory>, --no-image-dir",
      "video: ./videos, --video-dir <directory>, --no-video-dir",
      "document: ./documents, --document-dir <directory>, --no-document-dir",
      "font: ./fonts, --font-dir <directory>, --no-font-dir",
    ],
  },
  options: [
    "--api-url",
    "--project",
    "--environment",
    "--config",
    "--session",
    "--json",
    "--wait",
    "--no-wait",
    "--poll-interval",
    "--dry-run",
    "--delete",
    "--token-stdin",
    "--atomicity",
    "--show-ai-label",
    "--path",
    "--note",
    "--integration-note",
    "--kind",
    "--class",
    "--include",
    "--search",
    "--folder",
    "--to",
    "--file",
    "--width",
    "--height",
    "--format",
    "--quality",
    "--key",
    "--alt",
    "--dir",
    "--output-dir",
    "--image-list",
    "--video-list",
    "--font-list",
    "--document-list",
    "--image-dir",
    "--video-dir",
    "--document-dir",
    "--font-dir",
    "--no-image-dir",
    "--no-video-dir",
    "--no-document-dir",
    "--no-font-dir",
    "--check",
    "--write",
    "--version",
    "--r2-bucket",
    "--r2-prefix",
    "--public-base-url",
  ],
  projectResolution:
    "Project selection: --project, ASSETS_PROJECT (or ASSETS_PROJECT_ID), saved CLI config, package.json.name for bulk roots, or the sole accessible project.",
}

const resultFailure = (op: string, message: string, rawData?: unknown): Result<never> =>
  resultErrorCreate(op, message, rawData)

const pathRead = (env: NodeJS.ProcessEnv, option: string, fallbackDirectory: string, filename: string): string => {
  const configured = env[option]
  if (configured && configured.length > 0) return configured
  const home = env.HOME ?? homedir()
  const directory = env.XDG_CONFIG_HOME ?? join(home, fallbackDirectory)
  return join(directory, "assets", filename)
}

const configPathRead = (env: NodeJS.ProcessEnv): string =>
  env.ASSETS_CONFIG_FILE ?? env.ASSETS_CONFIG_PATH ?? pathRead(env, "ASSETS_CONFIG", ".config", "config.json")

const sessionPathRead = (env: NodeJS.ProcessEnv): string =>
  env.ASSETS_SESSION_FILE ?? env.ASSETS_SESSION_PATH ?? pathRead(env, "ASSETS_SESSION", ".local/state", "session.json")

const jsonFileRead = async <T>(filePath: string, schema: v.GenericSchema, op: string): Promise<Result<T | null>> => {
  let content: string
  try {
    content = await readFile(filePath, "utf8")
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return { success: true, data: null }
    return resultFailure(op, `Could not read ${filePath}`)
  }
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return resultFailure(op, `The JSON file ${filePath} was invalid`)
  }
  const parsed = v.safeParse(schema, value)
  if (!parsed.success)
    return resultFailure(op, `The JSON file ${filePath} did not match its schema`, v.summarize(parsed.issues))
  return { success: true, data: parsed.output as T }
}

const configRead = (env: NodeJS.ProcessEnv): Promise<Result<CliConfig | null>> =>
  jsonFileRead(configPathRead(env), configSchema, "assetsCliConfigRead")

const sessionRead = (env: NodeJS.ProcessEnv): Promise<Result<CliSession | null>> =>
  jsonFileRead(sessionPathRead(env), sessionSchema, "assetsCliSessionRead")

const jsonFileWrite = async (filePath: string, value: unknown, op: string): Promise<Result<undefined>> => {
  try {
    await mkdir(join(filePath, ".."), { recursive: true, mode: 0o700 })
    const temporaryPath = `${filePath}.tmp-${process.pid}`
    await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 })
    await rename(temporaryPath, filePath)
    return { success: true, data: undefined }
  } catch {
    return resultFailure(op, `Could not write ${filePath}`)
  }
}

const configWrite = (env: NodeJS.ProcessEnv, config: CliConfig): Promise<Result<undefined>> =>
  jsonFileWrite(configPathRead(env), config, "assetsCliConfigWrite")

const sessionWrite = (env: NodeJS.ProcessEnv, accessToken: string): Promise<Result<undefined>> =>
  jsonFileWrite(sessionPathRead(env), { accessToken }, "assetsCliSessionWrite")

const stdinRead = async (): Promise<string> => {
  let content = ""
  for await (const chunk of process.stdin) content += String(chunk)
  return content
}

const parsedCommandRead = (args: readonly string[]): Result<ParsedCommand> => {
  const options: Record<string, string | true> = {}
  const positionals: string[] = []
  let json = false
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === undefined) continue
    if (!argument.startsWith("--")) {
      positionals.push(argument)
      continue
    }
    const raw = argument.slice(2)
    const equalsIndex = raw.indexOf("=")
    const name = equalsIndex === -1 ? raw : raw.slice(0, equalsIndex)
    const inlineValue = equalsIndex === -1 ? undefined : raw.slice(equalsIndex + 1)
    if (name === "json") {
      if (inlineValue !== undefined) return resultFailure("assetsCliParse", "Flag --json does not accept a value")
      json = true
      continue
    }
    if (!optionNames.has(name) && !flagNames.has(name))
      return resultFailure("assetsCliParse", `Unknown option --${name}`)
    if (
      name === "alt" &&
      inlineValue === undefined &&
      (args[index + 1] === undefined || args[index + 1]?.startsWith("--"))
    ) {
      options[name] = true
      continue
    }
    if (flagNames.has(name)) {
      if (inlineValue !== undefined) return resultFailure("assetsCliParse", `Flag --${name} does not accept a value`)
      options[name] = true
      continue
    }
    const value = inlineValue ?? args[index + 1]
    if (value === undefined || value.startsWith("--"))
      return resultFailure("assetsCliParse", `Option --${name} needs a value`)
    if (inlineValue === undefined) index += 1
    options[name] = value
  }
  const command = positionals.shift()
  if (command === undefined) return { success: true, data: { command: "help", positionals, options, json } }
  const subcommand = ["auth", "outputs", "metadata", "settings"].includes(command) ? positionals.shift() : undefined
  return {
    success: true,
    data: { command, ...(subcommand === undefined ? {} : { subcommand }), positionals, options, json },
  }
}

const optionRead = (parsed: ParsedCommand, name: string): string | undefined => {
  const value = parsed.options[name]
  return typeof value === "string" ? value : undefined
}

const flagRead = (parsed: ParsedCommand, name: string): boolean => parsed.options[name] === true

const optionAllowed = (parsed: ParsedCommand, allowed: readonly string[]): Result<undefined> => {
  const allowedSet = new Set(allowed)
  for (const name of Object.keys(parsed.options)) {
    if (
      name === "json" ||
      name === "help" ||
      name === "api-url" ||
      name === "project" ||
      name === "environment" ||
      name === "config" ||
      name === "session"
    )
      continue
    if (!allowedSet.has(name))
      return resultFailure("assetsCliCommandValidate", `Option --${name} is not valid for this command`)
  }
  return { success: true, data: undefined }
}

const positionalRequire = (parsed: ParsedCommand, count: number): Result<readonly string[]> => {
  if (parsed.positionals.length !== count)
    return resultFailure("assetsCliCommandValidate", "The command arguments were invalid")
  return { success: true, data: parsed.positionals }
}

const numberRead = (
  value: string | undefined,
  name: string,
  minimum = 1,
  maximum = Number.MAX_SAFE_INTEGER,
): Result<number> => {
  if (value === undefined || !/^\d+$/u.test(value))
    return resultFailure("assetsCliCommandValidate", `--${name} must be a whole number`)
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum)
    return resultFailure("assetsCliCommandValidate", `--${name} was outside its allowed range`)
  return { success: true, data: number }
}

const targetPathRead = (target: string): Result<{ folders: string[]; filename: string }> => {
  if (target.length === 0 || target.startsWith("/") || target.includes("\\"))
    return resultFailure("assetsCliTargetPathRead", "The asset path was invalid")
  const segments = target.split("/")
  const filename = segments.pop()
  if (filename === undefined) return resultFailure("assetsCliTargetPathRead", "The asset filename was missing")
  const folders = v.safeParse(foldersSchema, segments)
  const parsedFilename = v.safeParse(assetFilenameSchema, filename)
  if (!folders.success || !parsedFilename.success)
    return resultFailure("assetsCliTargetPathRead", "The asset path was invalid")
  return { success: true, data: { folders: folders.output, filename: parsedFilename.output } }
}

const mediaTypeRead = (filePath: string): Result<string> => {
  const extension = filePath.toLocaleLowerCase().split(".").pop() ?? ""
  const mediaType =
    extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : extension === "png"
        ? "image/png"
        : extension === "webp"
          ? "image/webp"
          : extension === "avif"
            ? "image/avif"
            : extension === "gif"
              ? "image/gif"
              : extension === "mp4"
                ? "video/mp4"
                : extension === "webm"
                  ? "video/webm"
                  : extension === "woff"
                    ? "font/woff"
                    : extension === "woff2"
                      ? "font/woff2"
                      : extension === "ttf"
                        ? "font/ttf"
                        : extension === "otf"
                          ? "font/otf"
                          : undefined
  if (mediaType === undefined) return resultFailure("assetsCliMediaTypeRead", "The file extension is not supported")
  const parsed = v.safeParse(mediaTypeSchema, mediaType)
  if (!parsed.success) return resultFailure("assetsCliMediaTypeRead", "The detected media type was invalid")
  return { success: true, data: parsed.output }
}

const fileRead = async (filePath: string): Promise<Result<Uint8Array>> => {
  try {
    return { success: true, data: await readFile(filePath) }
  } catch {
    return resultFailure("assetsCliFileRead", `Could not read ${filePath}`)
  }
}

type UploadTransportResult = {
  uploadId: string
  status: string
  completion: {
    uploadId: string
    assetId: string
    sourceRevisionId: string
    workflowId: string
    status: "accepted"
  }
}

const uploadTransportExecute = async (
  client: AssetsApiClient,
  projectId: string,
  input: {
    environment?: string
    originalFilename: string
    folders: readonly string[]
    integrationNote: string
    bytes: Uint8Array
    mediaType: string
  },
): Promise<Result<UploadTransportResult>> => {
  const sha256 = contentSha256Create(input.bytes)
  const intent = await client.uploadIntentCreate(projectId, {
    ...(input.environment === undefined ? {} : { environment: input.environment }),
    originalFilename: input.originalFilename,
    folders: input.folders,
    integrationNote: input.integrationNote,
    byteSize: input.bytes.byteLength,
    mediaType: input.mediaType,
    sha256,
  })
  if (!intent.success) return intent
  const uploaded = await client.uploadObjectPut(intent.data.intent, input.bytes)
  if (!uploaded.success) return uploaded
  const completion = await client.uploadCompletionComplete(projectId, intent.data.uploadId, { sha256 })
  if (!completion.success) return completion
  return {
    success: true,
    data: {
      uploadId: intent.data.uploadId,
      status: intent.data.status,
      completion: completion.data,
    },
  }
}

const assetFileFingerprintEqual = (left: AssetFileFingerprint, right: AssetFileFingerprint): boolean =>
  left.byteSize === right.byteSize &&
  left.sha256 === right.sha256 &&
  left.identity.device === right.identity.device &&
  left.identity.inode === right.identity.inode &&
  left.identity.size === right.identity.size

const localAssetUnlink = async (input: {
  filePath: string
  mapping: Parameters<typeof assetFileFingerprint>[0]
  mediaType: Parameters<typeof assetFileFingerprint>[1]
  fingerprint: AssetFileFingerprint
}): Promise<Result<true>> => {
  const checked = await assetFileFingerprint(input.mapping, input.mediaType)
  if (!checked.success)
    return resultFailure(
      "assetsCliUploadAllDelete",
      `Could not verify the unchanged local file before deletion: ${input.filePath}`,
      checked,
    )
  if (!assetFileFingerprintEqual(input.fingerprint, checked.data))
    return resultFailure("assetsCliUploadAllDelete", `The local file changed before deletion: ${input.filePath}`)
  try {
    await unlink(input.filePath)
  } catch {
    return resultFailure("assetsCliUploadAllDelete", `Could not delete the local file: ${input.filePath}`)
  }
  return { success: true, data: true }
}

const assetReferenceRead = async (
  client: AssetsApiClient,
  projectId: string,
  reference: string,
): Promise<Result<string>> => {
  if (reference.length === 0) return resultFailure("assetsCliAssetReferenceRead", "The asset key was missing")
  if (!reference.includes("/") && !reference.includes("_")) return { success: true, data: reference }
  const assets = await client.assetsReadAll(projectId, { include: "outputs,metadata,history" })
  if (!assets.success) return assets
  for (const asset of assets.data) {
    if (asset.sourcePath === reference || asset.id === reference) return { success: true, data: asset.id }
    for (const output of asset.outputHistory ?? []) {
      if (assetIdentifierCreate(asset.folders, asset.basename, output.definition.key) === reference)
        return { success: true, data: asset.id }
    }
  }
  return resultFailure("assetsCliAssetReferenceRead", `The asset ${reference} was not found`)
}

const packageNameRead = async (projectRoot: string): Promise<Result<string | null>> => {
  const packagePath = join(resolve(projectRoot), "package.json")
  let content: string
  try {
    content = await readFile(packagePath, "utf8")
  } catch {
    return { success: true, data: null }
  }
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return { success: true, data: null }
  }
  if (value === null || typeof value !== "object" || !("name" in value) || typeof value.name !== "string")
    return { success: true, data: null }
  if (value.name.length === 0) return { success: true, data: null }
  return { success: true, data: value.name }
}

const projectAndEnvironmentRead = async (
  client: AssetsApiClient,
  parsed: ParsedCommand,
  config: CliConfig,
  projectRoot?: string,
  environmentSelection: ProjectEnvironmentSelection = "configured",
): Promise<Result<{ projectId: string; environment?: string }>> => {
  let projectId = optionRead(parsed, "project") ?? config.project
  if (projectId === undefined) {
    const projects = await client.projectsReadAll()
    if (!projects.success) return projects
    const packageNameResult: Result<string | null> =
      projectRoot === undefined ? { success: true, data: null } : await packageNameRead(projectRoot)
    if (!packageNameResult.success) return packageNameResult
    const matches =
      packageNameResult.data === null ? [] : projects.data.filter((project) => project.name === packageNameResult.data)
    if (matches.length === 1) projectId = matches[0]?.id
    if (projectId === undefined && projects.data.length === 1) projectId = projects.data[0]?.id
    if (projectId === undefined) {
      if (projects.data.length === 0)
        return resultFailure(
          "assetsCliProjectRead",
          "Could not determine the project. No accessible projects were found. Verify the API URL, token, and access.",
        )
      return resultFailure(
        "assetsCliProjectRead",
        "Could not determine the project. Use --project <name> or set ASSETS_PROJECT in the environment or the current working directory's .env file.",
      )
    }
  }
  const selectedEnvironment =
    optionRead(parsed, "environment") ?? (environmentSelection === "configured" ? config.environment : undefined)
  if (selectedEnvironment !== undefined) {
    const valid = v.safeParse(environmentNameSchema, selectedEnvironment)
    if (!valid.success) return resultFailure("assetsCliEnvironmentRead", "The environment was invalid")
    return { success: true, data: { projectId, environment: valid.output } }
  }
  const project = await client.projectRead(projectId)
  if (!project.success) return project
  return { success: true, data: { projectId, environment: project.data.defaultEnvironment } }
}

const filesRead = (parsed: ParsedCommand) => {
  const directory =
    optionRead(parsed, "dir") ?? optionRead(parsed, "output-dir") ?? join(process.cwd(), "src/app/assets")
  return {
    imageListPath: optionRead(parsed, "image-list") ?? join(directory, "imageList.ts"),
    videoListPath: optionRead(parsed, "video-list") ?? join(directory, "videoList.ts"),
    fontListPath: optionRead(parsed, "font-list") ?? join(directory, "fontList.ts"),
    documentListPath: optionRead(parsed, "document-list") ?? join(directory, "documentList.ts"),
  }
}

type DiffOutputEntry = {
  status: AssetDiffStatus
  class: string
  sourcePath: string
  logicalPath: string
  deletionEligible: boolean
  altChanged?: boolean
  localAlt?: string | null
  remoteAlt?: string | null
  reason?: string
}

type DiffOutput = {
  root: string
  environment: string
  entries: readonly DiffOutputEntry[]
  altUpdatesPending: number
}

const altUpdatesPendingRead = (diff: AssetDiff): number =>
  diff.entries.filter(
    (entry) =>
      entry.local !== undefined &&
      entry.altChanged &&
      (entry.status === "new" || entry.status === "changed" || entry.status === "metadata"),
  ).length

const diffOutputCreate = (root: string, environment: string, diff: AssetDiff): DiffOutput => ({
  root,
  environment,
  entries: diff.entries.map((entry) => ({
    status: entry.status,
    class: entry.class,
    sourcePath: entry.sourcePath,
    logicalPath: entry.logicalPath,
    deletionEligible: entry.deletionEligible,
    ...(entry.altChanged ? { altChanged: true, localAlt: entry.localAlt, remoteAlt: entry.remoteAlt } : {}),
    ...(entry.reason === undefined ? {} : { reason: entry.reason }),
  })),
  altUpdatesPending: altUpdatesPendingRead(diff),
})

const diffHumanOutputRead = (output: DiffOutput): string => {
  const counts = new Map<AssetDiffStatus, number>()
  for (const status of assetDiffStatuses) counts.set(status, 0)
  for (const entry of output.entries) counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1)
  const lines = [`Root: ${output.root}`, `Environment: ${output.environment}`]
  for (const entry of output.entries) {
    const eligibility =
      entry.status === "matching" ? (entry.deletionEligible ? " deletion-eligible" : " deletion-ineligible") : ""
    const reason = entry.reason === undefined ? "" : ` ${entry.reason}`
    lines.push(`${entry.status} ${entry.class} ${entry.sourcePath}${eligibility}${reason}`)
  }
  if (output.entries.length === 0) lines.push("No asset differences.")
  lines.push(
    `Summary: ${assetDiffStatuses.map((status) => `${status}=${counts.get(status) ?? 0}`).join(" ")} alt-updates-pending=${output.altUpdatesPending}`,
  )
  return `${lines.join("\n")}\n`
}

type UploadAllOutputEntry = {
  status: AssetDiffStatus
  class: AssetDiffEntry["class"]
  sourcePath: string
  logicalPath: string
  action: "uploaded" | "skipped" | "planned" | "failed"
  uploadId?: string
  assetId?: string
  sourceRevisionId?: string
  workflowId?: string
  workflowStatus?: string
  eligible?: boolean
  deleted?: boolean
  altChanged?: boolean
  localAlt?: string | null
  remoteAlt?: string | null
  altUpdated?: boolean
  altUpdatePlanned?: boolean
  altUpdateFailed?: boolean
  error?: string
}

type UploadAllOutput = {
  root: string
  environment: string
  wait: boolean
  delete: boolean
  dryRun: boolean
  entries: readonly UploadAllOutputEntry[]
  altUpdated: number
  altUpdatesPending: number
}

const uploadAllOutputEntryCreate = (
  entry: AssetDiffEntry,
  action: UploadAllOutputEntry["action"],
  details: Partial<Omit<UploadAllOutputEntry, "status" | "class" | "sourcePath" | "logicalPath" | "action">> = {},
): UploadAllOutputEntry => ({
  status: entry.status,
  class: entry.class,
  sourcePath: entry.sourcePath,
  logicalPath: entry.logicalPath,
  action,
  ...details,
})

const uploadAllHumanOutputRead = (output: UploadAllOutput): string => {
  const counts = new Map<UploadAllOutputEntry["action"], number>()
  for (const action of ["uploaded", "skipped", "planned", "failed"] as const) counts.set(action, 0)
  const lines = [
    `Root: ${output.root}`,
    `Environment: ${output.environment}`,
    `Wait: ${output.wait ? "yes" : "no"}`,
    `Delete: ${output.delete ? "yes" : "no"}`,
    `Dry run: ${output.dryRun ? "yes" : "no"}`,
  ]
  for (const entry of output.entries) {
    counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1)
    const details = [
      entry.action,
      entry.deleted === true ? "deleted" : "",
      entry.error === undefined ? "" : entry.error,
    ]
      .filter((value) => value.length > 0)
      .join(" ")
    lines.push(`${entry.status} ${entry.class} ${entry.sourcePath} ${details}`)
  }
  lines.push(
    `Summary: ${(["uploaded", "skipped", "planned", "failed"] as const)
      .map((action) => `${action}=${counts.get(action) ?? 0}`)
      .join(" ")} alt-updated=${output.altUpdated} alt-updates-pending=${output.altUpdatesPending}`,
  )
  return `${lines.join("\n")}\n`
}

const altNormalize = (alt: string | null | undefined): string | null => {
  const normalized = alt?.trim() ?? ""
  return normalized.length === 0 ? null : normalized
}

const altUpdateRequired = (entry: AssetDiffEntry): boolean =>
  entry.altChanged && altNormalize(entry.localAlt) !== altNormalize(entry.remoteAlt)

type AltUpdateOutputState = "updated" | "planned" | "failed"

const altUpdateOutputDetailsCreate = (
  entry: AssetDiffEntry,
  state: AltUpdateOutputState,
): Pick<
  UploadAllOutputEntry,
  "altChanged" | "localAlt" | "remoteAlt" | "altUpdated" | "altUpdatePlanned" | "altUpdateFailed"
> => ({
  altChanged: true,
  localAlt: entry.localAlt,
  remoteAlt: entry.remoteAlt,
  ...(state === "updated" ? { altUpdated: true } : {}),
  ...(state === "planned" ? { altUpdatePlanned: true } : {}),
  ...(state === "failed" ? { altUpdateFailed: true } : {}),
})

const assetAltMetadataUpdate = async (
  client: AssetsApiClient,
  projectId: string,
  assetId: string,
  alt: string | null,
): Promise<Result<undefined>> => {
  const normalizedAlt = altNormalize(alt)
  if (normalizedAlt === null) {
    const unset = await client.assetMetadataUnset(projectId, assetId, { field: "alt" })
    if (!unset.success) return unset
    return { success: true, data: undefined }
  }
  const updated = await client.assetMetadataSet(projectId, assetId, { alt: normalizedAlt })
  if (!updated.success) return updated
  return { success: true, data: undefined }
}

const diffDeletionEligibilityApply = async (
  client: AssetsApiClient,
  projectId: string,
  environment: string,
  local: Parameters<typeof assetDiffClassify>[0]["local"],
  remoteManifest: RemoteAssetHistoryManifest,
  initialDiff: AssetDiff,
): Promise<Result<AssetDiff>> => {
  const op = "assetsCliDiff"
  const eligibilityByRevision = new Map<
    string,
    NonNullable<RemoteAssetHistoryManifest["entries"][number]["deletionEligibility"]>
  >()
  for (const entry of initialDiff.entries) {
    if (entry.status !== "matching" || entry.remote === undefined) continue
    const sourceRevisionId = entry.remote.currentSourceRevisionId
    if (eligibilityByRevision.has(sourceRevisionId)) continue
    const eligibility = await client.sourceRevisionDeletionEligibilityRead(projectId, environment, sourceRevisionId)
    if (!eligibility.success) return eligibility
    if (eligibility.data.sourceRevisionId !== sourceRevisionId)
      return resultFailure(op, "The deletion eligibility revision did not match")
    eligibilityByRevision.set(sourceRevisionId, eligibility.data)
  }
  if (eligibilityByRevision.size === 0) return { success: true, data: initialDiff }
  const remote = remoteManifest.entries.map((entry) => {
    const eligibility = eligibilityByRevision.get(entry.currentSourceRevisionId)
    return eligibility === undefined ? entry : { ...entry, deletionEligibility: eligibility }
  })
  return assetDiffClassify({ local, remote })
}

const uploadAllCommandRun = async (
  parsed: ParsedCommand,
  client: AssetsApiClient,
  projectId: string,
  environment: string | undefined,
): Promise<CommandOutput> => {
  const op = "assetsCliUploadAll"
  const allowed = optionAllowed(parsed, [
    ...diffSourceDirectoryOptionNames,
    "integration-note",
    "wait",
    "no-wait",
    "poll-interval",
    "dry-run",
    "delete",
  ])
  if (!allowed.success) return { result: allowed }
  if (flagRead(parsed, "wait") && flagRead(parsed, "no-wait"))
    return { result: resultFailure(op, "--wait and --no-wait cannot be used together") }
  if (flagRead(parsed, "delete") && flagRead(parsed, "no-wait"))
    return { result: resultFailure(op, "--delete requires waiting and cannot be used with --no-wait") }
  if (environment === undefined) return { result: resultFailure(op, "Upload-all requires an environment") }
  const integrationNote = optionRead(parsed, "integration-note")
  if (integrationNote === undefined || integrationNote.length === 0 || integrationNote.length > 10000)
    return { result: resultFailure(op, "Upload-all requires --integration-note with 1 to 10000 characters") }

  const rootInput = parsed.positionals[0] ?? "."
  const overrides = projectSourceConfigurationOverridesParse(
    Object.fromEntries(Object.entries(parsed.options).filter(([name]) => diffSourceDirectoryOptionNames.has(name))),
  )
  if (!overrides.success) return { result: overrides }
  const configuration = await projectSourceConfigurationRead(rootInput, overrides.data)
  if (!configuration.success) return { result: configuration }
  const local = await localAssetManifestLoad(configuration.data.root, configuration.data.sourceDirectories)
  if (!local.success) return { result: local }
  const remote = await remoteAssetHistoryManifestLoad({ client, projectId })
  if (!remote.success) return { result: remote }
  const classified = assetDiffClassify({
    local: local.data.entries,
    remote: remote.data.entries,
  })
  if (!classified.success) return { result: classified }

  const wait = flagRead(parsed, "wait") || flagRead(parsed, "delete")
  const deleteLocal = flagRead(parsed, "delete")
  const dryRun = flagRead(parsed, "dry-run")
  const localEntries = classified.data.entries.filter((entry) => entry.local !== undefined)
  const preflightFailures = localEntries.filter(
    (entry) => entry.status === "unsupported" || entry.status === "conflict",
  )
  if (preflightFailures.length > 0) {
    const entries = localEntries.map((entry) =>
      entry.status === "unsupported" || entry.status === "conflict"
        ? uploadAllOutputEntryCreate(entry, "failed", {
            error: entry.reason ?? "The local asset did not pass preflight",
          })
        : uploadAllOutputEntryCreate(entry, "skipped"),
    )
    const output: UploadAllOutput = {
      root: configuration.data.root,
      environment,
      wait,
      delete: deleteLocal,
      dryRun,
      entries,
      altUpdated: 0,
      altUpdatesPending: 0,
    }
    return {
      result: { success: true, data: output },
      exitCode: 1,
      humanOutput: uploadAllHumanOutputRead(output),
    }
  }

  const actionableEntries = classified.data.entries.filter(
    (entry) =>
      entry.local !== undefined &&
      (entry.status === "new" ||
        entry.status === "changed" ||
        entry.status === "matching" ||
        entry.status === "metadata"),
  )
  const entries: UploadAllOutputEntry[] = []
  const altUpdatesPending = actionableEntries.filter(altUpdateRequired).length
  let altUpdated = 0
  let failed = false
  for (const entry of actionableEntries) {
    const localEntry = entry.local
    if (localEntry === undefined || localEntry.mapping === undefined || localEntry.mediaType === undefined) {
      failed = true
      entries.push(
        uploadAllOutputEntryCreate(entry, "failed", { error: "The local asset was missing its upload mapping" }),
      )
      continue
    }
    if (dryRun) {
      entries.push(
        uploadAllOutputEntryCreate(
          entry,
          entry.status === "matching" && !altUpdateRequired(entry) ? "skipped" : "planned",
          altUpdateRequired(entry) ? altUpdateOutputDetailsCreate(entry, "planned") : {},
        ),
      )
      continue
    }

    let altDetails: Partial<Omit<UploadAllOutputEntry, "status" | "class" | "sourcePath" | "logicalPath" | "action">> =
      {}
    if (altUpdateRequired(entry) && (entry.status === "metadata" || entry.status === "matching")) {
      const assetId = entry.remote?.assetId
      if (assetId === undefined) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...altUpdateOutputDetailsCreate(entry, "failed"),
            error: "The asset metadata update had no remote asset id",
          }),
        )
        continue
      }
      const updated = await assetAltMetadataUpdate(client, projectId, assetId, entry.localAlt)
      if (!updated.success) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...altUpdateOutputDetailsCreate(entry, "failed"),
            error: updated.errorMessage,
          }),
        )
        continue
      }
      altUpdated += 1
      altDetails = altUpdateOutputDetailsCreate(entry, "updated")
    }

    if (entry.status === "metadata") {
      entries.push(uploadAllOutputEntryCreate(entry, "skipped", altDetails))
      continue
    }

    if (entry.status === "matching") {
      if (!deleteLocal) {
        entries.push(uploadAllOutputEntryCreate(entry, "skipped", altDetails))
        continue
      }
      const sourceRevisionId = entry.remote?.currentSourceRevisionId
      if (sourceRevisionId === undefined) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...altDetails,
            error: "The matching asset had no source revision",
          }),
        )
        continue
      }
      const eligibility = await client.sourceRevisionDeletionEligibilityRead(projectId, environment, sourceRevisionId)
      if (!eligibility.success) {
        failed = true
        entries.push(uploadAllOutputEntryCreate(entry, "failed", { ...altDetails, error: eligibility.errorMessage }))
        continue
      }
      if (eligibility.data.sourceRevisionId !== sourceRevisionId) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...altDetails,
            eligible: false,
            error: "The deletion eligibility revision did not match",
          }),
        )
        continue
      }
      if (!eligibility.data.eligible) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...altDetails,
            eligible: false,
            error: "The source revision was not eligible for local deletion",
          }),
        )
        continue
      }
      const deleted = await localAssetUnlink({
        filePath: localEntry.mapping.filePath,
        mapping: localEntry.mapping,
        mediaType: localEntry.mediaType,
        fingerprint: localEntry.fingerprint!,
      })
      if (!deleted.success) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...altDetails,
            eligible: true,
            deleted: false,
            error: deleted.errorMessage,
          }),
        )
        continue
      }
      entries.push(
        uploadAllOutputEntryCreate(entry, "skipped", {
          ...altDetails,
          eligible: true,
          deleted: true,
        }),
      )
      continue
    }

    const fingerprint = localEntry.fingerprint
    if (fingerprint === undefined) {
      failed = true
      entries.push(
        uploadAllOutputEntryCreate(entry, "failed", {
          error: `The local file could not be revalidated before upload: ${localEntry.mapping.filePath}`,
        }),
      )
      continue
    }
    const revalidated = await assetFileFingerprint(localEntry.mapping, localEntry.mediaType)
    if (!revalidated.success || !assetFileFingerprintEqual(fingerprint, revalidated.data)) {
      failed = true
      entries.push(
        uploadAllOutputEntryCreate(entry, "failed", {
          error: `The local file changed before upload: ${localEntry.mapping.filePath}`,
        }),
      )
      continue
    }
    const bytes = await fileRead(localEntry.mapping.filePath)
    if (!bytes.success) {
      failed = true
      entries.push(uploadAllOutputEntryCreate(entry, "failed", { error: bytes.errorMessage }))
      continue
    }
    const sha256 = contentSha256Create(bytes.data)
    if (revalidated.data.byteSize !== bytes.data.byteLength || revalidated.data.sha256 !== sha256) {
      failed = true
      entries.push(
        uploadAllOutputEntryCreate(entry, "failed", {
          error: `The local file changed before upload: ${localEntry.mapping.filePath}`,
        }),
      )
      continue
    }
    const uploaded = await uploadTransportExecute(client, projectId, {
      ...(environment === undefined ? {} : { environment }),
      originalFilename: localEntry.mapping.filename,
      folders: localEntry.mapping.folders,
      integrationNote,
      bytes: bytes.data,
      mediaType: localEntry.mediaType,
    })
    if (!uploaded.success) {
      failed = true
      entries.push(uploadAllOutputEntryCreate(entry, "failed", { error: uploaded.errorMessage }))
      continue
    }
    const uploadDetails = {
      uploadId: uploaded.data.uploadId,
      assetId: uploaded.data.completion.assetId,
      sourceRevisionId: uploaded.data.completion.sourceRevisionId,
      workflowId: uploaded.data.completion.workflowId,
    }
    if (altUpdateRequired(entry)) {
      const assetId = entry.remote?.assetId ?? uploaded.data.completion.assetId
      const updated = await assetAltMetadataUpdate(client, projectId, assetId, entry.localAlt)
      if (!updated.success) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...uploadDetails,
            ...altUpdateOutputDetailsCreate(entry, "failed"),
            error: updated.errorMessage,
          }),
        )
        continue
      }
      altUpdated += 1
      altDetails = altUpdateOutputDetailsCreate(entry, "updated")
    }
    let workflowStatus: string | undefined
    if (wait) {
      const workflow = await client.workflowWait(projectId, uploaded.data.completion.workflowId)
      if (!workflow.success) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...uploadDetails,
            ...altDetails,
            error: workflow.errorMessage,
          }),
        )
        continue
      }
      workflowStatus = workflow.data.status
      if (workflow.data.status !== "succeeded") {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...uploadDetails,
            ...altDetails,
            workflowStatus,
            error: `The upload workflow ended with status ${workflow.data.status}`,
          }),
        )
        continue
      }
    }
    if (deleteLocal) {
      const eligibility = await client.sourceRevisionDeletionEligibilityRead(
        projectId,
        environment,
        uploaded.data.completion.sourceRevisionId,
      )
      if (!eligibility.success) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...uploadDetails,
            ...altDetails,
            ...(workflowStatus === undefined ? {} : { workflowStatus }),
            error: eligibility.errorMessage,
          }),
        )
        continue
      }
      if (eligibility.data.sourceRevisionId !== uploaded.data.completion.sourceRevisionId) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...uploadDetails,
            ...altDetails,
            ...(workflowStatus === undefined ? {} : { workflowStatus }),
            eligible: false,
            error: "The deletion eligibility revision did not match",
          }),
        )
        continue
      }
      if (!eligibility.data.eligible) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...uploadDetails,
            ...altDetails,
            ...(workflowStatus === undefined ? {} : { workflowStatus }),
            eligible: false,
            error: "The source revision was not eligible for local deletion",
          }),
        )
        continue
      }
      const deleted = await localAssetUnlink({
        filePath: localEntry.mapping.filePath,
        mapping: localEntry.mapping,
        mediaType: localEntry.mediaType,
        fingerprint: fingerprint!,
      })
      if (!deleted.success) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...uploadDetails,
            ...altDetails,
            ...(workflowStatus === undefined ? {} : { workflowStatus }),
            eligible: true,
            deleted: false,
            error: deleted.errorMessage,
          }),
        )
        continue
      }
      entries.push(
        uploadAllOutputEntryCreate(entry, "uploaded", {
          ...uploadDetails,
          ...altDetails,
          ...(workflowStatus === undefined ? {} : { workflowStatus }),
          eligible: true,
          deleted: true,
        }),
      )
      continue
    }
    entries.push(
      uploadAllOutputEntryCreate(entry, "uploaded", {
        ...uploadDetails,
        ...altDetails,
        ...(workflowStatus === undefined ? {} : { workflowStatus }),
      }),
    )
  }

  const output: UploadAllOutput = {
    root: configuration.data.root,
    environment,
    wait,
    delete: deleteLocal,
    dryRun,
    entries,
    altUpdated,
    altUpdatesPending,
  }
  return {
    result: { success: true, data: output },
    exitCode: failed ? 1 : 0,
    humanOutput: uploadAllHumanOutputRead(output),
  }
}

type ProjectSettingsEnvironmentOutput = {
  environment: string
  r2Bucket: string
  r2Prefix: string
  publicBaseUrl: string
}

type ProjectSettingsEnvironmentChanges = {
  r2Bucket?: string
  r2Prefix?: string
  publicBaseUrl?: string
}

const projectSettingsEnvironmentRead = (
  settings: ProjectSettings,
  environmentName: string,
  op: string,
): Result<ProjectSettingsEnvironmentOutput> => {
  const environment = settings.environments.find((candidate) => candidate.name === environmentName)
  if (environment === undefined)
    return resultFailure(op, `The ${environmentName} environment is not configured for this project`)
  return {
    success: true,
    data: {
      environment: environment.name,
      r2Bucket: environment.r2Bucket,
      r2Prefix: environment.r2Prefix,
      publicBaseUrl: environment.publicBaseUrl,
    },
  }
}

const projectSettingsUpdateRead = (
  settings: ProjectSettings,
  environmentName: string,
  changes: ProjectSettingsEnvironmentChanges,
): Result<ProjectSettingsUpdate> => {
  const selected = projectSettingsEnvironmentRead(settings, environmentName, "assetsCliSettingsUpdate")
  if (!selected.success) return selected
  const update = {
    name: settings.project.name,
    defaultEnvironment: settings.project.defaultEnvironment,
    binding:
      settings.binding === null
        ? null
        : {
            zitadelProjectId: settings.binding.zitadelProjectId,
            serviceProjectId: settings.binding.serviceProjectId,
          },
    environments: settings.environments.map((environment) => ({
      name: environment.name,
      r2Bucket:
        environment.name === environmentName ? (changes.r2Bucket ?? environment.r2Bucket) : environment.r2Bucket,
      r2Prefix:
        environment.name === environmentName ? (changes.r2Prefix ?? environment.r2Prefix) : environment.r2Prefix,
      publicBaseUrl:
        environment.name === environmentName
          ? (changes.publicBaseUrl ?? environment.publicBaseUrl)
          : environment.publicBaseUrl,
    })),
  }
  const parsed = v.safeParse(projectSettingsUpdateSchema, update)
  if (!parsed.success)
    return resultFailure(
      "assetsCliSettingsUpdate",
      "The project settings update was invalid",
      v.summarize(parsed.issues),
    )
  return { success: true, data: parsed.output }
}

const commandRun = async (
  parsed: ParsedCommand,
  client: AssetsApiClient,
  config: CliConfig,
  env: NodeJS.ProcessEnv,
  stdin: () => Promise<string>,
): Promise<CommandOutput> => {
  if (parsed.command === "help") return { result: { success: true, data: commandHelp } }

  if (parsed.command === "auth" && parsed.subcommand === "login") {
    if (parsed.positionals.length !== 0)
      return { result: resultFailure("assetsCliAuthLogin", "The login command takes no positional arguments") }
    const allowed = optionAllowed(parsed, ["token-stdin", "token"])
    if (!allowed.success) return { result: allowed }
    if (optionRead(parsed, "token") !== undefined)
      return { result: resultFailure("assetsCliAuthLogin", "Tokens are not accepted as command arguments") }
    if (flagRead(parsed, "token-stdin")) {
      const token = (await stdin()).trim()
      if (token.length === 0 || /\s/u.test(token))
        return { result: resultFailure("assetsCliAuthLogin", "Token input was empty or invalid") }
      const stored = await sessionWrite(env, token)
      if (!stored.success) return { result: stored }
      return { result: { success: true, data: { authenticated: true, sessionFile: sessionPathRead(env) } } }
    }
    const loggedIn = await client.authLogin()
    if (!loggedIn.success) return { result: loggedIn }
    const storedConfig = await configWrite(env, {
      ...config,
      ...(optionRead(parsed, "api-url") ? { apiUrl: optionRead(parsed, "api-url") } : {}),
    })
    if (!storedConfig.success) return { result: storedConfig }
    return {
      result: { success: true, data: { authorizationUrl: loggedIn.data.authorizationUrl, authenticated: false } },
    }
  }

  if (parsed.command === "doctor") {
    if (parsed.positionals.length !== 0)
      return { result: resultFailure("assetsCliDoctor", "The doctor command takes no positional arguments") }
    const allowed = optionAllowed(parsed, [])
    if (!allowed.success) return { result: allowed }
    const selected = await projectAndEnvironmentRead(client, parsed, config)
    if (!selected.success) return { result: selected }
    const checks: Array<{ name: string; status: "ok" | "failed"; message?: string }> = []
    const health = await client.healthRead()
    checks.push(
      health.success ? { name: "api", status: "ok" } : { name: "api", status: "failed", message: health.errorMessage },
    )
    const ready = await client.readyRead()
    checks.push(
      ready.success
        ? { name: "readiness", status: "ok" }
        : { name: "readiness", status: "failed", message: ready.errorMessage },
    )
    const environment = selected.data.environment
    if (environment === undefined) {
      checks.push({ name: "environment", status: "failed", message: "An environment was not selected" })
    } else {
      const remoteEnvironment = await client.environmentRead(selected.data.projectId, environment)
      checks.push(
        remoteEnvironment.success
          ? { name: "environment", status: "ok" }
          : { name: "environment", status: "failed", message: remoteEnvironment.errorMessage },
      )
    }
    const ok = checks.every((check) => check.status === "ok")
    return {
      result: { success: true, data: { projectId: selected.data.projectId, environment, checks, ok } },
      exitCode: ok ? 0 : 1,
    }
  }

  if (parsed.command === "settings") {
    if (parsed.positionals.length !== 0)
      return { result: resultFailure("assetsCliSettings", "The settings command takes no positional arguments") }
    if (parsed.subcommand === "read") {
      const allowed = optionAllowed(parsed, [])
      if (!allowed.success) return { result: allowed }
      const selected = await projectAndEnvironmentRead(client, parsed, config, undefined, "project-default")
      if (!selected.success) return { result: selected }
      const environment = selected.data.environment
      if (environment === undefined)
        return { result: resultFailure("assetsCliSettingsRead", "Settings read requires an environment") }
      const settings = await client.projectSettingsRead(selected.data.projectId)
      if (!settings.success) return { result: settings }
      return { result: projectSettingsEnvironmentRead(settings.data, environment, "assetsCliSettingsRead") }
    }
    if (parsed.subcommand === "update") {
      const allowed = optionAllowed(parsed, ["r2-bucket", "r2-prefix", "public-base-url"])
      if (!allowed.success) return { result: allowed }
      const environment = optionRead(parsed, "environment")
      if (environment === undefined)
        return { result: resultFailure("assetsCliSettingsUpdate", "Settings update requires --environment") }
      const changes = {
        ...(optionRead(parsed, "r2-bucket") === undefined ? {} : { r2Bucket: optionRead(parsed, "r2-bucket") }),
        ...(optionRead(parsed, "r2-prefix") === undefined ? {} : { r2Prefix: optionRead(parsed, "r2-prefix") }),
        ...(optionRead(parsed, "public-base-url") === undefined
          ? {}
          : { publicBaseUrl: optionRead(parsed, "public-base-url") }),
      }
      if (Object.keys(changes).length === 0)
        return {
          result: resultFailure("assetsCliSettingsUpdate", "Settings update requires at least one changed field"),
        }
      const selected = await projectAndEnvironmentRead(client, parsed, config)
      if (!selected.success) return { result: selected }
      const settings = await client.projectSettingsRead(selected.data.projectId)
      if (!settings.success) return { result: settings }
      const update = projectSettingsUpdateRead(settings.data, environment, changes)
      if (!update.success) return { result: update }
      const written = await client.projectSettingsWrite(selected.data.projectId, update.data)
      if (!written.success) return { result: written }
      return { result: projectSettingsEnvironmentRead(written.data, environment, "assetsCliSettingsUpdate") }
    }
    return { result: resultFailure("assetsCliSettings", "Use settings read or update") }
  }

  if (
    ![
      "diff",
      "upload-all",
      "import",
      "upload",
      "list",
      "lists",
      "show",
      "outputs",
      "metadata",
      "move",
      "delete",
    ].includes(parsed.command)
  )
    return { result: resultFailure("assetsCliCommand", `Unknown command ${parsed.command}`) }

  if (parsed.command === "diff" && parsed.positionals.length > 1)
    return { result: resultFailure("assetsCliDiff", "The diff command takes zero or one root argument") }
  if (parsed.command === "upload-all" && parsed.positionals.length > 1)
    return { result: resultFailure("assetsCliUploadAll", "The upload-all command takes zero or one root argument") }

  const projectRoot =
    parsed.command === "diff" || parsed.command === "upload-all" ? (parsed.positionals[0] ?? ".") : undefined
  const selected = await projectAndEnvironmentRead(client, parsed, config, projectRoot)
  if (!selected.success) return { result: selected }
  const projectId = selected.data.projectId

  if (parsed.command === "upload-all") return uploadAllCommandRun(parsed, client, projectId, selected.data.environment)

  if (parsed.command === "diff") {
    const allowed = optionAllowed(parsed, [...diffSourceDirectoryOptionNames])
    if (!allowed.success) return { result: allowed }
    if (selected.data.environment === undefined)
      return { result: resultFailure("assetsCliDiff", "Diff requires an environment") }
    const rootInput = parsed.positionals[0] ?? "."
    const overrides = projectSourceConfigurationOverridesParse(
      Object.fromEntries(Object.entries(parsed.options).filter(([name]) => diffSourceDirectoryOptionNames.has(name))),
    )
    if (!overrides.success) return { result: overrides }
    const configuration = await projectSourceConfigurationRead(rootInput, overrides.data)
    if (!configuration.success) return { result: configuration }
    const local = await localAssetManifestLoad(configuration.data.root, configuration.data.sourceDirectories)
    if (!local.success) return { result: local }
    const remote = await remoteAssetHistoryManifestLoad({
      client,
      projectId,
    })
    if (!remote.success) return { result: remote }
    const classified = assetDiffClassify({ local: local.data.entries, remote: remote.data.entries })
    if (!classified.success) return { result: classified }
    const diff = await diffDeletionEligibilityApply(
      client,
      projectId,
      selected.data.environment,
      local.data.entries,
      remote.data,
      classified.data,
    )
    if (!diff.success) return { result: diff }
    const output = diffOutputCreate(configuration.data.root, selected.data.environment, diff.data)
    return {
      result: { success: true, data: output },
      exitCode: output.entries.every((entry) => entry.status === "matching") ? 0 : 1,
      humanOutput: diffHumanOutputRead(output),
    }
  }

  if (parsed.command === "import") {
    const positional = positionalRequire(parsed, 1)
    if (!positional.success) return { result: positional }
    const allowed = optionAllowed(parsed, ["atomicity", "show-ai-label", "wait", "no-wait", "poll-interval"])
    if (!allowed.success) return { result: allowed }
    if (flagRead(parsed, "wait") && flagRead(parsed, "no-wait"))
      return { result: resultFailure("assetsCliImport", "--wait and --no-wait cannot be used together") }
    const atomicity = optionRead(parsed, "atomicity")
    if (
      atomicity !== undefined &&
      atomicity !== "all_or_nothing" &&
      atomicity !== "best_effort" &&
      atomicity !== "partial"
    )
      return { result: resultFailure("assetsCliImport", "--atomicity must be all_or_nothing or best_effort") }
    const input = {
      root: positional.data[0],
      ...(selected.data.environment === undefined ? {} : { environment: selected.data.environment }),
      ...(atomicity === undefined ? {} : { atomicity: atomicity === "partial" ? "best_effort" : atomicity }),
      ...(flagRead(parsed, "show-ai-label") ? { showAiLabel: true } : {}),
    }
    const imported = await client.importRequestCreate(projectId, input)
    if (!imported.success) return { result: imported }
    if (!flagRead(parsed, "wait") || flagRead(parsed, "no-wait")) return { result: imported }
    const status = await client.importWait(projectId, imported.data.import.id)
    if (!status.success) return { result: status }
    return {
      result: { success: true, data: { import: status.data } },
      exitCode: status.data.status === "succeeded" ? 0 : 1,
    }
  }

  if (parsed.command === "upload") {
    const positional = positionalRequire(parsed, 1)
    if (!positional.success) return { result: positional }
    const allowed = optionAllowed(parsed, ["path", "integration-note", "note", "wait", "no-wait", "poll-interval"])
    if (!allowed.success) return { result: allowed }
    if (flagRead(parsed, "wait") && flagRead(parsed, "no-wait"))
      return { result: resultFailure("assetsCliUpload", "--wait and --no-wait cannot be used together") }
    const filePath = positional.data[0] ?? ""
    const target = optionRead(parsed, "path")
    const integrationNote = optionRead(parsed, "integration-note") ?? optionRead(parsed, "note")
    if (optionRead(parsed, "integration-note") !== undefined && optionRead(parsed, "note") !== undefined)
      return { result: resultFailure("assetsCliUpload", "Use only one of --integration-note and --note") }
    if (target === undefined || integrationNote === undefined || integrationNote.length === 0)
      return { result: resultFailure("assetsCliUpload", "Upload requires --path and --integration-note") }
    const parsedTarget = targetPathRead(target)
    if (!parsedTarget.success) return { result: parsedTarget }
    const bytes = await fileRead(filePath)
    if (!bytes.success) return { result: bytes }
    const mediaType = mediaTypeRead(filePath)
    if (!mediaType.success) return { result: mediaType }
    const uploaded = await uploadTransportExecute(client, projectId, {
      ...(selected.data.environment === undefined ? {} : { environment: selected.data.environment }),
      originalFilename: parsedTarget.data.filename,
      folders: parsedTarget.data.folders,
      integrationNote,
      bytes: bytes.data,
      mediaType: mediaType.data,
    })
    if (!uploaded.success) return { result: uploaded }
    const uploadResult = uploaded.data
    if (!flagRead(parsed, "wait") || flagRead(parsed, "no-wait"))
      return { result: { success: true, data: uploadResult } }
    const workflow = await client.workflowWait(projectId, uploaded.data.completion.workflowId)
    if (!workflow.success) return { result: workflow }
    return {
      result: { success: true, data: { ...uploadResult, workflow: workflow.data } },
      exitCode: workflow.data.status === "succeeded" ? 0 : 1,
    }
  }

  if (parsed.command === "list") {
    if (parsed.positionals.length !== 0)
      return { result: resultFailure("assetsCliList", "The list command takes no positional arguments") }
    const allowed = optionAllowed(parsed, ["class", "kind", "include", "search", "folder"])
    if (!allowed.success) return { result: allowed }
    const include = optionRead(parsed, "include")
    if (
      include !== undefined &&
      !include
        .split(",")
        .map((value) => value.trim())
        .every((value) => ["outputs", "metadata", "history"].includes(value))
    )
      return { result: resultFailure("assetsCliList", "--include must contain outputs, metadata, or history") }
    if (
      optionRead(parsed, "class") !== undefined &&
      optionRead(parsed, "kind") !== undefined &&
      optionRead(parsed, "class") !== optionRead(parsed, "kind")
    )
      return { result: resultFailure("assetsCliList", "--class and --kind must match when both are provided") }
    const assetClass = optionRead(parsed, "class") ?? optionRead(parsed, "kind")
    const assets = await client.assetsReadAll(projectId, {
      ...(assetClass === undefined ? {} : { class: assetClass }),
      ...(optionRead(parsed, "include") === undefined ? {} : { include: optionRead(parsed, "include") }),
      ...(optionRead(parsed, "search") === undefined ? {} : { search: optionRead(parsed, "search") }),
      ...(optionRead(parsed, "folder") === undefined ? {} : { folder: optionRead(parsed, "folder") }),
    })
    return { result: assets.success ? { success: true, data: { assets: assets.data } } : assets }
  }

  if (parsed.command === "lists") {
    const allowed = optionAllowed(parsed, [
      "check",
      "dir",
      "output-dir",
      "image-list",
      "video-list",
      "font-list",
      "document-list",
      "write",
    ])
    if (!allowed.success) return { result: allowed }
    if (parsed.positionals.length !== 0)
      return { result: resultFailure("assetsCliLists", "The lists command takes no positional arguments") }
    if (selected.data.environment === undefined)
      return { result: resultFailure("assetsCliLists", "Lists requires an environment") }
    const lists = await client.catalogListsRead(projectId, selected.data.environment)
    if (!lists.success) return { result: lists }
    const files = filesRead(parsed)
    const check = flagRead(parsed, "check")
    if (check) {
      const matches = await catalogListsCheck(files, lists.data)
      if (!matches.success) return { result: matches }
      return {
        result: { success: true, data: { digest: lists.data.digest, files, matches: matches.data } },
        exitCode: matches.data ? 0 : 1,
      }
    }
    if (flagRead(parsed, "write") || !check) {
      const written = await catalogListsWrite(files, lists.data)
      if (!written.success) return { result: written }
      return { result: { success: true, data: { digest: lists.data.digest, files, written: true } } }
    }
    return { result: lists }
  }

  const assetPositional = positionalRequire(
    parsed,
    parsed.command === "outputs" && parsed.subcommand === "remove" ? 2 : 1,
  )
  if (!assetPositional.success) return { result: assetPositional }
  const assetReference = await assetReferenceRead(client, projectId, assetPositional.data[0] ?? "")
  if (!assetReference.success) return { result: assetReference }
  const assetId = assetReference.data

  if (parsed.command === "show") {
    const allowed = optionAllowed(parsed, [])
    if (!allowed.success) return { result: allowed }
    return { result: await client.assetRead(projectId, assetId) }
  }

  if (parsed.command === "outputs") {
    if (parsed.subcommand === "list") {
      const allowed = optionAllowed(parsed, [])
      if (!allowed.success) return { result: allowed }
      return { result: await client.assetOutputsRead(projectId, assetId) }
    }
    if (parsed.subcommand === "remove") {
      const output = positionalRequire(parsed, 2)
      if (!output.success) return { result: output }
      const allowed = optionAllowed(parsed, [])
      if (!allowed.success) return { result: allowed }
      return { result: await client.assetOutputRemove(projectId, assetId, { key: output.data[1] }) }
    }
    if (parsed.subcommand === "add") {
      const kind = optionRead(parsed, "kind") ?? "image"
      const allowed = optionAllowed(
        parsed,
        kind === "image" ? ["kind", "key", "width", "height", "format", "quality", "show-ai-label"] : ["kind", "key"],
      )
      if (!allowed.success) return { result: allowed }
      const key = optionRead(parsed, "key")
      if (kind === "image") {
        const width = numberRead(optionRead(parsed, "width"), "width")
        const height = numberRead(optionRead(parsed, "height"), "height")
        const format = optionRead(parsed, "format")
        if (!width.success || !height.success || format === undefined)
          return {
            result: resultFailure("assetsCliOutputsAdd", "Image outputs require --width, --height, and --format"),
          }
        const body = {
          kind: "image" as const,
          key: key ?? `${width.data}x${height.data}_${format}`,
          width: width.data,
          height: height.data,
          format,
          ...(optionRead(parsed, "quality") === undefined ? {} : { quality: Number(optionRead(parsed, "quality")) }),
          ...(flagRead(parsed, "show-ai-label") ? { showAiLabel: true } : {}),
        }
        return { result: await client.assetOutputAdd(projectId, assetId, body) }
      }
      if (kind === "video" || kind === "font") {
        const body =
          kind === "video"
            ? { kind: "video" as const, key: key ?? "default" }
            : { kind: "font" as const, key: key ?? "default", format: "woff2" as const }
        return { result: await client.assetOutputAdd(projectId, assetId, body) }
      }
      return { result: resultFailure("assetsCliOutputsAdd", "The output kind was invalid") }
    }
    if (parsed.subcommand === "set") {
      const allowed = optionAllowed(parsed, ["file"])
      if (!allowed.success) return { result: allowed }
      const file = optionRead(parsed, "file")
      if (file === undefined)
        return { result: resultFailure("assetsCliOutputsSet", "Output replacement requires --file") }
      const content = await fileRead(file)
      if (!content.success) return { result: content }
      let value: unknown
      try {
        value = JSON.parse(new TextDecoder().decode(content.data))
      } catch {
        return { result: resultFailure("assetsCliOutputsSet", "The output JSON file was invalid") }
      }
      const body = Array.isArray(value) ? { outputs: value } : value
      return { result: await client.assetOutputsSet(projectId, assetId, body) }
    }
    return { result: resultFailure("assetsCliOutputs", "Use outputs list, add, remove, or set") }
  }

  if (parsed.command === "metadata") {
    if (parsed.subcommand === "set") {
      const allowed = optionAllowed(parsed, ["alt"])
      if (!allowed.success) return { result: allowed }
      const alt = optionRead(parsed, "alt")
      if (alt === undefined) return { result: resultFailure("assetsCliMetadataSet", "Metadata set requires --alt") }
      return { result: await client.assetMetadataSet(projectId, assetId, { alt }) }
    }
    if (parsed.subcommand === "unset") {
      const allowed = optionAllowed(parsed, ["alt"])
      if (!allowed.success) return { result: allowed }
      if (parsed.options.alt !== true && optionRead(parsed, "alt") !== "alt")
        return { result: resultFailure("assetsCliMetadataUnset", "Metadata unset requires --alt") }
      return { result: await client.assetMetadataUnset(projectId, assetId, { field: "alt" }) }
    }
    return { result: resultFailure("assetsCliMetadata", "Use metadata set or unset") }
  }

  if (parsed.command === "move") {
    const allowed = optionAllowed(parsed, ["to"])
    if (!allowed.success) return { result: allowed }
    const to = optionRead(parsed, "to")
    if (to === undefined) return { result: resultFailure("assetsCliMove", "Move requires --to") }
    return { result: await client.assetMove(projectId, assetId, { to }) }
  }

  if (parsed.command === "delete") {
    const allowed = optionAllowed(parsed, ["wait", "no-wait", "poll-interval"])
    if (!allowed.success) return { result: allowed }
    if (flagRead(parsed, "wait") && flagRead(parsed, "no-wait"))
      return { result: resultFailure("assetsCliDelete", "--wait and --no-wait cannot be used together") }
    const deletion = await client.assetDeleteRequest(projectId, assetId)
    if (!deletion.success || !flagRead(parsed, "wait") || flagRead(parsed, "no-wait")) return { result: deletion }
    const status = await client.deletionWait(projectId, assetId)
    if (!status.success) return { result: status }
    return { result: status, exitCode: status.data.status === "succeeded" ? 0 : 1 }
  }

  return { result: resultFailure("assetsCliCommand", `Unknown command ${parsed.command}`) }
}

const structuredFailureRead = (result: Extract<Result<unknown>, { success: false }>) => {
  const raw = result.rawData
  const rawObject = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined
  const nestedError =
    rawObject?.error && typeof rawObject.error === "object" ? (rawObject.error as Record<string, unknown>) : undefined
  const knownCodes = new Set([
    "validation_failed",
    "not_configured",
    "unauthorized",
    "forbidden",
    "not_found",
    "method_not_allowed",
    "service_unavailable",
    "conflict",
    "upstream_failure",
    "job_failed",
    "internal_error",
  ])
  const codeValue = nestedError?.code ?? rawObject?.code
  const inferredCode =
    result.op === "assetsCliConfig" || result.op === "assetsCliSessionRead"
      ? "not_configured"
      : /Parse|Validate|Target|Media|Command|Environment|Project|Settings|SourceConfiguration|RootScan|Preflight|Diff/u.test(
            result.op,
          ) || /invalid|requires|must be|missing|outside|did not match/u.test(result.errorMessage)
        ? "validation_failed"
        : "internal_error"
  const code =
    typeof codeValue === "string" && knownCodes.has(codeValue)
      ? (codeValue as Parameters<typeof apiFailureEnvelopeCreate>[0]["code"])
      : inferredCode
  const requestId = typeof rawObject?.requestId === "string" ? rawObject.requestId : undefined
  return {
    error: {
      code,
      message: result.errorMessage,
      ...(nestedError?.details && typeof nestedError.details === "object"
        ? { details: nestedError.details as Record<string, unknown> }
        : {}),
      retryable: code === "service_unavailable" || code === "internal_error" || nestedError?.retryable === true,
    },
    ...(requestId === undefined ? {} : { requestId }),
  }
}

const humanValueRead = (data: unknown): string => {
  if (data && typeof data === "object" && "authorizationUrl" in data && typeof data.authorizationUrl === "string")
    return `Open this URL to sign in:\n${data.authorizationUrl}\n`
  if (data && typeof data === "object" && "matches" in data && typeof data.matches === "boolean")
    return data.matches ? "Generated lists match.\n" : "Generated lists do not match.\n"
  return `${JSON.stringify(data, null, 2)}\n`
}

const outputWrite = (
  output: CommandOutput,
  json: boolean,
  stdout: (text: string) => void,
  stderr: (text: string) => void,
): number => {
  if (output.result.success) {
    stdout(
      json
        ? jsonEnvelopeStringify(apiSuccessEnvelopeCreate(output.result.data))
        : (output.humanOutput ?? humanValueRead(output.result.data)),
    )
    return output.exitCode ?? 0
  }
  const failure = structuredFailureRead(output.result)
  if (json) stdout(jsonEnvelopeStringify(apiFailureEnvelopeCreate(failure.error, failure.requestId)))
  else stderr(`${failure.error.code}: ${failure.error.message}\n`)
  return output.exitCode ?? 1
}

export const assetsCliMain = async (args = process.argv.slice(2), options: AssetsCliOptions = {}): Promise<number> => {
  const sourceEnv = options.env ?? process.env
  const stdout = options.stdout ?? ((text: string) => process.stdout.write(text))
  const stderr = options.stderr ?? ((text: string) => process.stderr.write(text))
  const parsed = parsedCommandRead(args)
  if (!parsed.success) return outputWrite({ result: parsed }, args.includes("--json"), stdout, stderr)
  if (flagRead(parsed.data, "version")) {
    stdout(`assets ${packageVersion}\n`)
    return 0
  }
  if (flagRead(parsed.data, "help") || parsed.data.command === "help")
    return outputWrite({ result: { success: true, data: commandHelp } }, parsed.data.json, stdout, stderr)

  const env: NodeJS.ProcessEnv = {
    ...sourceEnv,
    ...(optionRead(parsed.data, "config") === undefined
      ? {}
      : { ASSETS_CONFIG_FILE: optionRead(parsed.data, "config") }),
    ...(optionRead(parsed.data, "session") === undefined
      ? {}
      : { ASSETS_SESSION_FILE: optionRead(parsed.data, "session") }),
  }

  const configResult = await configRead(env)
  if (!configResult.success) return outputWrite({ result: configResult }, parsed.data.json, stdout, stderr)
  const config: CliConfig = {
    ...(configResult.data ?? {}),
    ...(env.ASSETS_PROJECT === undefined && env.ASSETS_PROJECT_ID === undefined
      ? {}
      : { project: env.ASSETS_PROJECT ?? env.ASSETS_PROJECT_ID }),
    ...(env.ASSETS_ENVIRONMENT === undefined ? {} : { environment: env.ASSETS_ENVIRONMENT }),
  }
  const apiUrl = optionRead(parsed.data, "api-url") ?? env.ASSETS_API_URL ?? config.apiUrl
  if (apiUrl === undefined)
    return outputWrite(
      { result: resultFailure("assetsCliConfig", "Set ASSETS_API_URL or --api-url") },
      parsed.data.json,
      stdout,
      stderr,
    )
  const sessionResult = await sessionRead(env)
  if (!sessionResult.success) return outputWrite({ result: sessionResult }, parsed.data.json, stdout, stderr)
  const accessToken = env.ASSETS_TOKEN ?? env.ASSETS_ACCESS_TOKEN ?? sessionResult.data?.accessToken
  const pollInterval = optionRead(parsed.data, "poll-interval")
  const parsedPollInterval =
    pollInterval === undefined ? undefined : numberRead(pollInterval, "poll-interval", 0, 3600000)
  if (parsedPollInterval !== undefined && !parsedPollInterval.success)
    return outputWrite({ result: parsedPollInterval }, parsed.data.json, stdout, stderr)
  const clientResult = assetsApiClientCreate({
    apiUrl,
    ...(accessToken === undefined ? {} : { accessToken }),
    ...(env.ASSETS_SESSION_COOKIE === undefined ? {} : { sessionCookie: env.ASSETS_SESSION_COOKIE }),
    fetcher: options.fetcher,
    sleep: options.sleep,
    pollIntervalMilliseconds: parsedPollInterval?.data,
  })
  if (!clientResult.success) return outputWrite({ result: clientResult }, parsed.data.json, stdout, stderr)
  const command = await commandRun(parsed.data, clientResult.data, config, env, options.stdinRead ?? stdinRead)
  return outputWrite(command, parsed.data.json, stdout, stderr)
}

if (import.meta.main) process.exit(await assetsCliMain())
