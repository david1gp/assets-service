#!/usr/bin/env bun
import { createHash } from "node:crypto"
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve, sep } from "node:path"
import { type ProjectServiceCreateProjectOptions, projectServiceCreateProject } from "@adaptive-ds/zitadel-cli/v2"
import * as v from "valibot"

import { apiFailureEnvelopeCreate } from "../api/apiFailureEnvelopeCreate.js"
import { apiSuccessEnvelopeCreate } from "../api/apiSuccessEnvelopeCreate.js"
import { jsonEnvelopeStringify } from "../api/jsonEnvelopeStringify.js"
import { assetsApiClientCreate } from "../api-client/assetsApiClientCreate.js"
import { assetsApiResultOptionalRead } from "../api-client/assetsApiResultOptionalRead.js"
import type { OutputDefinitionInput } from "../api-client/outputDefinitionInputSchema.js"
import type { StorageMigrationStatusResponse } from "../api-client/storageMigrationStatusResponseSchema.js"
import { assetFilenameSchema } from "../asset/assetFilenameSchema.js"
import { assetIdentifierCreate } from "../asset/assetIdentifierCreate.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import {
  type AssetDiff,
  type AssetDiffEntry,
  type AssetDiffStatus,
  assetDiffClassify,
  assetDiffStatuses,
} from "../asset-cli/assetDiffClassify.js"
import { type AssetFileFingerprint, assetFileFingerprint } from "../asset-cli/assetFileFingerprint.js"
import { cliCommandHelp } from "../asset-cli/cliCommandHelp.js"
import { cliHelpFormat } from "../asset-cli/cliHelpFormat.js"
import { localAssetManifestLoad } from "../asset-cli/localAssetManifestLoad.js"
import { remoteAssetHistoryManifestLoad } from "../asset-cli/remoteAssetHistoryManifestLoad.js"
import { assetsCliVersionMetadataRender } from "../assetsCliVersionMetadataRender.js"
import { catalogListsCheck } from "../catalog/catalogListsCheck.js"
import { catalogListsWrite } from "../catalog/catalogListsWrite.js"
import {
  type EnvironmentConfiguration,
  environmentConfigurationResolve,
} from "../config/environmentConfigurationResolve.js"
import { environmentValueRead } from "../config/environmentValueRead.js"
import { globalOrganizationConfigurationCompatibilityPathResolve } from "../config/globalOrganizationConfigurationCompatibilityPathResolve.js"
import { globalOrganizationConfigurationPathResolve } from "../config/globalOrganizationConfigurationPathResolve.js"
import { globalOrganizationConfigurationRead } from "../config/globalOrganizationConfigurationRead.js"
import {
  type OrganizationConfiguration,
  organizationConfigurationResolve,
} from "../config/organizationConfigurationResolve.js"
import type { OrganizationDefinition } from "../config/organizationDefinitionSchema.js"
import { projectCreateEnvironmentFileRead } from "../config/projectCreateEnvironmentFileRead.js"
import { projectSourceConfigurationOverridesParse } from "../config/projectSourceConfigurationOverridesParse.js"
import { projectSourceConfigurationRead } from "../config/projectSourceConfigurationRead.js"
import type { ProjectSourceConfiguration } from "../config/projectSourceConfigurationSchema.js"
import type { OutputDefinition } from "../output/outputDefinitionSchema.js"
import { packageVersion } from "../packageVersion.js"
import type { ProjectCreate } from "../project/projectCreateSchema.js"
import { projectCreateSchema } from "../project/projectCreateSchema.js"
import type { ProjectSettings } from "../project/projectSettingsSchema.js"
import { type ProjectSettingsUpdate, projectSettingsUpdateSchema } from "../project/projectSettingsUpdateSchema.js"
import { r2PrefixSchema } from "../project/r2PrefixSchema.js"
import { contentSha256Create } from "../schemas/contentSha256Create.js"
import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type UploadStatus, uploadStatusSchema } from "../upload/uploadStatusSchema.js"
import { uploadsListRun } from "../upload/uploadsListRun.js"
import type { WranglerCommandRunner } from "../wrangler/wranglerCommandRunner.js"
import { wranglerCommandRunnerProduction } from "../wrangler/wranglerCommandRunnerProduction.js"
import { wranglerProvisioningRun } from "../wrangler/wranglerProvisioningRun.js"

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>

export type AssetsCliOptions = {
  env?: NodeJS.ProcessEnv
  fetcher?: Fetcher
  zitadelProjectCreate?: ZitadelProjectCreate
  sleep?: (milliseconds: number) => Promise<void>
  stdout?: (text: string) => void
  stderr?: (text: string) => void
  stdinRead?: () => Promise<string>
  wranglerRunner?: WranglerCommandRunner
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

type ProjectCreateCliInput = Omit<ProjectCreate, "binding"> & {
  binding: Omit<ProjectCreate["binding"], "zitadelProjectId"> & { zitadelProjectId?: string }
}

type ZitadelProjectCreateOptions = {
  config: NonNullable<ProjectServiceCreateProjectOptions["config"]>
  request: NonNullable<ProjectServiceCreateProjectOptions["request"]>
}

type ZitadelProjectCreateResult =
  | { success: true; data: { projectId: string } }
  | { success: false; errorMessage?: string }

type ZitadelProjectCreate = (options: ZitadelProjectCreateOptions) => Promise<ZitadelProjectCreateResult>

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
  "class",
  "config",
  "document-list",
  "dir",
  "document-dir",
  "env-file",
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
  "organization",
  "path",
  "poll-interval",
  "project",
  "quality",
  "r2-bucket",
  "r2-prefix",
  "public-base-url",
  "custom-domain",
  "days",
  "default-environment",
  "development-r2-bucket",
  "development-r2-prefix",
  "development-public-base-url",
  "production-r2-bucket",
  "production-r2-prefix",
  "production-public-base-url",
  "service-project-id",
  "zitadel-project-id",
  "name",
  "slug",
  "zone-id",
  "wrangler-profile",
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
  "today",
  "wait",
  "apply",
  "create-bucket",
  "write",
  "delete",
  "version",
  "verbose",
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

const commandHelp = cliCommandHelp

const resultFailure = (op: string, message: string, rawData?: unknown): Result<never> =>
  resultErrorCreate(op, message, rawData)

const zitadelProjectCreateDefault: ZitadelProjectCreate = async (options) => {
  const result = await projectServiceCreateProject({ config: options.config, request: options.request })
  if (!result.success || typeof result.data.projectId !== "string") return { success: false }
  return { success: true, data: { projectId: result.data.projectId } }
}

const zitadelProjectIdCreate = async (
  input: ProjectCreateCliInput,
  env: NodeJS.ProcessEnv,
  projectCreate: ZitadelProjectCreate,
): Promise<Result<string>> => {
  const op = "assetsCliZitadelProjectCreate"
  const baseUrl = env.ZITADEL_BASE_URL?.trim()
  const token = env.ZITADEL_TOKEN
  if (baseUrl === undefined || baseUrl.length === 0)
    return resultFailure(op, "Automatic Zitadel project creation requires ZITADEL_BASE_URL")
  if (token === undefined || token.trim().length === 0)
    return resultFailure(op, "Automatic Zitadel project creation requires ZITADEL_TOKEN")

  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return resultFailure(op, "ZITADEL_BASE_URL must be an absolute HTTP or HTTPS URL")
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  )
    return resultFailure(op, "ZITADEL_BASE_URL must be an absolute HTTP or HTTPS URL without credentials")

  let result: ZitadelProjectCreateResult
  try {
    result = await projectCreate({
      config: { baseUrl, token },
      request: { organizationId: input.organization.id, name: input.name },
    })
  } catch {
    return resultFailure(op, "Automatic Zitadel project creation failed", { code: "upstream_failure" })
  }
  const parsedProjectId = result.success ? v.safeParse(idSchema, result.data.projectId) : undefined
  if (!result.success || parsedProjectId === undefined || !parsedProjectId.success)
    return resultFailure(op, "Automatic Zitadel project creation failed", { code: "upstream_failure" })
  return { success: true, data: parsedProjectId.output }
}

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

const configRead = async (
  env: NodeJS.ProcessEnv,
  sourceEnvironment: NodeJS.ProcessEnv,
): Promise<Result<CliConfig | null>> => {
  const path = configPathRead(env)
  const config = await jsonFileRead<CliConfig>(path, configSchema, "assetsCliConfigRead")
  if (config.success) return config
  if (
    env.ASSETS_CONFIG_FILE !== undefined ||
    env.ASSETS_CONFIG_PATH !== undefined ||
    env.ASSETS_CONFIG !== undefined ||
    path !== globalOrganizationConfigurationCompatibilityPathResolve({ env: sourceEnvironment })
  )
    return config

  const canonical = await globalOrganizationConfigurationRead({
    path: globalOrganizationConfigurationPathResolve({ env: sourceEnvironment }),
  })
  if (!canonical.success || canonical.data !== null) return config
  const fallback = await globalOrganizationConfigurationRead({ path })
  if (!fallback.success || fallback.data === null) return config
  return { success: true, data: null }
}

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
  const subcommand = ["auth", "config", "catalogs", "outputs", "metadata", "settings", "projects", "uploads"].includes(
    command,
  )
    ? positionals.shift()
    : undefined
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
      name === "session" ||
      name === "organization" ||
      name === "env-file"
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

const assetReferenceUniqueRead = async (
  client: AssetsApiClient,
  projectId: string,
  reference: string,
): Promise<Result<string>> => {
  const op = "assetsCliReprocess"
  if (reference.length === 0) return resultFailure(op, "The asset key or id was missing")
  const assets = await client.assetsReadAll(projectId, { include: "outputs,metadata,history" })
  if (!assets.success) return assets
  const matches = assets.data.filter((asset) => {
    if (asset.id === reference || asset.sourcePath === reference) return true
    return (asset.outputHistory ?? []).some(
      (output) => assetIdentifierCreate(asset.folders, asset.basename, output.definition.key) === reference,
    )
  })
  if (matches.length === 0) return resultFailure(op, `The asset ${reference} was not found`)
  if (matches.length > 1) return resultFailure(op, `More than one asset matched ${reference}; use an asset id`)
  const asset = matches[0]
  if (asset === undefined) return resultFailure(op, `The asset ${reference} was not found`)
  return { success: true, data: asset.id }
}

const projectEnvironmentIdRead = async (
  client: AssetsApiClient,
  projectId: string,
  environmentName: string,
  op: string,
): Promise<Result<string>> => {
  const environments = await client.environmentsRead(projectId)
  if (!environments.success) return environments
  const matches = environments.data.environments.filter((environment) => environment.name === environmentName)
  if (matches.length === 0)
    return resultFailure(op, `The ${environmentName} environment is not configured for this project`)
  if (matches.length > 1)
    return resultFailure(op, `The ${environmentName} environment is configured more than once for this project`)
  const environment = matches[0]
  if (environment === undefined)
    return resultFailure(op, `The ${environmentName} environment is not configured for this project`)
  return { success: true, data: environment.id }
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

const commandRootRead = (parsed: ParsedCommand): string | undefined => {
  if (
    parsed.command === "diff" ||
    parsed.command === "upload-all" ||
    (parsed.command === "config" && parsed.subcommand === "show")
  )
    return parsed.positionals[0] ?? "."
  return undefined
}

type ConfigShowGlobalSource = "canonical" | "fallback" | "none"

type ConfigShowGlobalOutput = {
  canonicalPath: string
  fallbackPath: string
  canonicalExists: boolean
  fallbackExists: boolean
  canonicalLoaded: boolean
  fallbackLoaded: boolean
  loaded: boolean
  source: ConfigShowGlobalSource
}

type ConfigShowValueOutput = {
  value: string | null
  source: string
}

type ConfigShowOutput = {
  globalConfiguration: ConfigShowGlobalOutput
  environmentFile: {
    path: string
    source: string
    loaded: boolean
  }
  organization: {
    value: string | null
    id: string | null
    name: string | null
    source: string
  }
  project: ConfigShowValueOutput
  environment: ConfigShowValueOutput
  apiUrl: ConfigShowValueOutput
  sourceDirectories: {
    root: string
    configPath: string
    configLoaded: boolean
    values: ProjectSourceConfiguration
  }
}

const fileExistsRead = async (filePath: string): Promise<Result<boolean>> => {
  try {
    await stat(filePath)
    return { success: true, data: true }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return { success: true, data: false }
    return resultFailure("assetsCliConfigShow", `Could not inspect ${filePath}`)
  }
}

const configShowGlobalRead = async (sourceEnvironment: NodeJS.ProcessEnv): Promise<Result<ConfigShowGlobalOutput>> => {
  const pathOptions = { env: sourceEnvironment }
  const canonicalPath = globalOrganizationConfigurationPathResolve(pathOptions)
  const fallbackPath = globalOrganizationConfigurationCompatibilityPathResolve(pathOptions)
  const canonicalExists = await fileExistsRead(canonicalPath)
  if (!canonicalExists.success) return canonicalExists
  const fallbackExists = await fileExistsRead(fallbackPath)
  if (!fallbackExists.success) return fallbackExists
  const global = await globalOrganizationConfigurationRead(pathOptions)
  if (!global.success) return global
  const source: ConfigShowGlobalSource = global.data === null ? "none" : canonicalExists.data ? "canonical" : "fallback"
  return {
    success: true,
    data: {
      canonicalPath,
      fallbackPath,
      canonicalExists: canonicalExists.data,
      fallbackExists: fallbackExists.data,
      canonicalLoaded: source === "canonical",
      fallbackLoaded: source === "fallback",
      loaded: source !== "none",
      source,
    },
  }
}

const configShowEnvironmentFileSourceRead = (
  parsed: ParsedCommand,
  sourceEnvironment: NodeJS.ProcessEnv,
  commandRoot: string | undefined,
  envFilePath: string,
): string => {
  if (optionRead(parsed, "env-file") !== undefined) return "option"
  if (sourceEnvironment.ASSETS_ENV_FILE !== undefined && sourceEnvironment.ASSETS_ENV_FILE.length > 0)
    return "process-environment"
  if (commandRoot === undefined) return "working-directory"
  const workingDirectory = resolve(sourceEnvironment.PWD ?? process.cwd())
  const commandRootFilePath = join(resolve(workingDirectory, commandRoot), ".env")
  return envFilePath === commandRootFilePath || envFilePath.startsWith(`${commandRootFilePath}${sep}`)
    ? "command-root"
    : "working-directory"
}

const configShowValueRead = (candidates: readonly (readonly [string | undefined, string])[]): ConfigShowValueOutput => {
  for (const [value, source] of candidates) {
    if (value !== undefined) return { value, source }
  }
  return { value: null, source: "unresolved" }
}

const configShowApiUrlRead = (value: ConfigShowValueOutput): ConfigShowValueOutput => {
  if (value.value === null) return value
  if (!URL.canParse(value.value)) return { ...value, value: null }
  const parsed = new URL(value.value)
  if (
    parsed.username.length === 0 &&
    parsed.password.length === 0 &&
    parsed.search.length === 0 &&
    parsed.hash.length === 0
  )
    return value
  return { ...value, value: `${parsed.origin}${parsed.pathname}` }
}

const configShowCommandRun = async (input: {
  parsed: ParsedCommand
  sourceEnvironment: NodeJS.ProcessEnv
  environment: EnvironmentConfiguration
  commandRoot: string | undefined
  savedConfig: CliConfig
  organization: OrganizationConfiguration
  globalConfiguration: ConfigShowGlobalOutput
}): Promise<CommandOutput> => {
  const { parsed, sourceEnvironment, environment, commandRoot, savedConfig, organization, globalConfiguration } = input
  if (parsed.subcommand !== "show") return { result: resultFailure("assetsCliConfigShow", "Use config show") }
  if (parsed.positionals.length > 1)
    return { result: resultFailure("assetsCliConfigShow", "The config show command takes zero or one root argument") }
  const allowed = optionAllowed(parsed, [])
  if (!allowed.success) return { result: allowed }

  const rootInput = parsed.positionals[0] ?? "."
  const sourceConfiguration = await projectSourceConfigurationRead(rootInput)
  if (!sourceConfiguration.success) return { result: sourceConfiguration }
  const sourceConfigurationPath = join(sourceConfiguration.data.root, "assets.config.json")
  const sourceConfigurationLoaded = await fileExistsRead(sourceConfigurationPath)
  if (!sourceConfigurationLoaded.success) return { result: sourceConfigurationLoaded }
  const packageName = await packageNameRead(rootInput)
  if (!packageName.success) return { result: packageName }

  const projectEnvironment = environmentValueRead(sourceEnvironment, environment.fileEnvironment, [
    "ASSETS_PROJECT",
    "ASSETS_PROJECT_ID",
  ])
  const selectedEnvironmentValue = environmentValueRead(sourceEnvironment, environment.fileEnvironment, [
    "ASSETS_ENVIRONMENT",
  ])
  const apiUrlEnvironment = environmentValueRead(sourceEnvironment, environment.fileEnvironment, ["ASSETS_API_URL"])
  const project = configShowValueRead([
    [optionRead(parsed, "project"), "option"],
    [projectEnvironment.value, projectEnvironment.source],
    [savedConfig.project, "saved-config"],
    [packageName.data ?? undefined, "package-json"],
  ])
  const selectedEnvironment = configShowValueRead([
    [optionRead(parsed, "environment"), "option"],
    [selectedEnvironmentValue.value, selectedEnvironmentValue.source],
    [savedConfig.environment, "saved-config"],
  ])
  const apiUrl = configShowApiUrlRead(
    configShowValueRead([
      [optionRead(parsed, "api-url"), "option"],
      [apiUrlEnvironment.value, apiUrlEnvironment.source],
      [savedConfig.apiUrl, "saved-config"],
    ]),
  )
  const organizationValue = organization.organization
  const output: ConfigShowOutput = {
    globalConfiguration,
    environmentFile: {
      path: environment.envFilePath,
      source: configShowEnvironmentFileSourceRead(parsed, sourceEnvironment, commandRoot, environment.envFilePath),
      loaded: environment.envFileLoaded,
    },
    organization: {
      value: organizationValue?.slug ?? null,
      id: organizationValue?.id ?? null,
      name: organizationValue?.name ?? null,
      source: organization.source,
    },
    project,
    environment: selectedEnvironment,
    apiUrl,
    sourceDirectories: {
      root: sourceConfiguration.data.root,
      configPath: sourceConfigurationPath,
      configLoaded: sourceConfigurationLoaded.data,
      values: sourceConfiguration.data.sourceDirectories,
    },
  }
  const lines = [
    `Global configuration: ${output.globalConfiguration.source} (${output.globalConfiguration.loaded ? "loaded" : "not loaded"})`,
    `  canonical: ${output.globalConfiguration.canonicalPath} (${output.globalConfiguration.canonicalExists ? "exists" : "missing"}, ${output.globalConfiguration.canonicalLoaded ? "loaded" : "not loaded"}, ${output.globalConfiguration.source === "canonical" ? "selected" : "not selected"})`,
    `  fallback: ${output.globalConfiguration.fallbackPath} (${output.globalConfiguration.fallbackExists ? "exists" : "missing"}, ${output.globalConfiguration.fallbackLoaded ? "loaded" : "not loaded"}, ${output.globalConfiguration.source === "fallback" ? "selected" : "not selected"})`,
    `Environment file: ${output.environmentFile.path} (${output.environmentFile.source}, ${output.environmentFile.loaded ? "loaded" : "not loaded"})`,
    `Organization: ${output.organization.value ?? "unresolved"} (${output.organization.source})`,
    `Project: ${output.project.value ?? "unresolved"} (${output.project.source})`,
    `Environment: ${output.environment.value ?? "unresolved"} (${output.environment.source})`,
    `API URL: ${output.apiUrl.value ?? "unresolved"} (${output.apiUrl.source})`,
    `Source directories: ${output.sourceDirectories.root}`,
    `  config: ${output.sourceDirectories.configPath} (${output.sourceDirectories.configLoaded ? "loaded" : "defaults"})`,
    ...(["image", "video", "document", "font"] as const).map(
      (assetClass) => `  ${assetClass}: ${output.sourceDirectories.values[assetClass] ?? "disabled"}`,
    ),
  ]
  return { result: { success: true, data: output }, humanOutput: `${lines.join("\n")}\n` }
}

const projectAndEnvironmentRead = async (
  client: AssetsApiClient,
  parsed: ParsedCommand,
  config: CliConfig,
  projectRoot?: string,
  environmentSelection: ProjectEnvironmentSelection = "configured",
  organizationId?: string,
  includeArchived = false,
): Promise<Result<{ projectId: string; environment?: string }>> => {
  let projectId = optionRead(parsed, "project") ?? config.project
  let projectDefaultEnvironment: string | undefined
  if (projectId !== undefined && organizationId !== undefined) {
    const directProject = assetsApiResultOptionalRead(await client.projectRead(projectId))
    if (!directProject.success) return directProject
    if (directProject.data !== null) {
      projectDefaultEnvironment = directProject.data.defaultEnvironment
    } else {
      const projects = await client.projectsReadAll({ includeArchived })
      if (!projects.success) return projects
      if (!projects.data.some((project) => project.id === projectId)) {
        const scopedMatches = projects.data.filter(
          (project) => project.organizationId === organizationId && project.name === projectId,
        )
        if (scopedMatches.length === 1) projectId = scopedMatches[0]?.id
        if (scopedMatches.length > 1)
          return resultFailure("assetsCliProjectRead", `More than one project named ${projectId} was found`)
        if (scopedMatches.length === 0 && projects.data.some((project) => project.name === projectId))
          return resultFailure(
            "assetsCliProjectRead",
            `The project ${projectId} was not found in the selected organization`,
          )
      }
    }
  }
  if (projectId === undefined) {
    const projects = await client.projectsReadAll({ includeArchived })
    if (!projects.success) return projects
    const scopedProjects =
      organizationId === undefined
        ? projects.data
        : projects.data.filter((project) => project.organizationId === organizationId)
    const packageNameResult: Result<string | null> =
      projectRoot === undefined ? { success: true, data: null } : await packageNameRead(projectRoot)
    if (!packageNameResult.success) return packageNameResult
    const matches =
      packageNameResult.data === null ? [] : scopedProjects.filter((project) => project.name === packageNameResult.data)
    if (matches.length === 1) projectId = matches[0]?.id
    if (projectId === undefined && scopedProjects.length === 1) projectId = scopedProjects[0]?.id
    if (projectId === undefined) {
      if (scopedProjects.length === 0)
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
  if (projectDefaultEnvironment !== undefined)
    return { success: true, data: { projectId, environment: projectDefaultEnvironment } }
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
      (entry.status === "new" ||
        entry.status === "changed" ||
        entry.status === "metadata" ||
        entry.status === "needs-processing"),
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
  defaultReconciled?: boolean
  defaultReconciliationPlanned?: boolean
  defaultReconciliationFailed?: boolean
  reprocessed?: boolean
  reprocessPlanned?: boolean
  reprocessFailed?: boolean
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
  defaultReconciled: number
  defaultReconciliationsPending: number
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
      entry.defaultReconciled === true ? "default-reconciled" : "",
      entry.defaultReconciliationPlanned === true ? "default-reconciliation-planned" : "",
      entry.reprocessed === true ? "reprocessed" : "",
      entry.reprocessPlanned === true ? "reprocess-planned" : "",
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
      .join(
        " ",
      )} alt-updated=${output.altUpdated} alt-updates-pending=${output.altUpdatesPending} default-reconciled=${output.defaultReconciled} default-reconciliations-pending=${output.defaultReconciliationsPending}`,
  )
  return `${lines.join("\n")}\n`
}

const outputDefinitionInputCreate = (definition: OutputDefinition): OutputDefinitionInput => {
  if (definition.kind === "image") {
    return {
      kind: "image",
      key: definition.key,
      width: definition.width,
      height: definition.height,
      format: definition.format,
      ...(definition.quality === undefined ? {} : { quality: definition.quality }),
      ...(definition.showAiLabel === undefined ? {} : { showAiLabel: definition.showAiLabel }),
    }
  }
  if (definition.kind === "video") return { kind: "video", key: definition.key }
  if (definition.kind === "document") return { kind: "document", key: "default" }
  return { kind: "font", key: definition.key, format: definition.format }
}

const managedImageDefaultRead = (entry: AssetDiffEntry): OutputDefinition | undefined => {
  if (entry.status !== "matching" || entry.remote?.class !== "image") return undefined
  const defaultId = `output-${entry.remote.assetId}-default`
  return entry.remote.outputHistory.find((history) => history.definition.id === defaultId)?.definition
}

const managedImageDefaultReconciliationRequired = (entry: AssetDiffEntry): boolean => {
  const definition = managedImageDefaultRead(entry)
  return (
    definition?.kind === "image" &&
    (definition.key !== "default" ||
      definition.width !== 1920 ||
      definition.height !== 1080 ||
      definition.format !== "avif" ||
      definition.quality !== 80 ||
      definition.showAiLabel !== undefined)
  )
}

const managedImageDefaultReconciliationInputsCreate = (
  entry: AssetDiffEntry,
): Result<readonly OutputDefinitionInput[]> => {
  const remote = entry.remote
  if (remote === undefined) return resultFailure("assetsCliUploadAll", "The matching asset had no remote asset")
  const defaultId = `output-${remote.assetId}-default`
  const outputs = remote.outputHistory.map(({ definition }) =>
    definition.id === defaultId
      ? {
          kind: "image" as const,
          key: "default",
          width: 1920,
          height: 1080,
          format: "avif" as const,
          quality: 80,
        }
      : outputDefinitionInputCreate(definition),
  )
  return { success: true, data: outputs }
}

const managedImageDefaultReconcile = async (
  client: AssetsApiClient,
  projectId: string,
  entry: AssetDiffEntry,
): Promise<Result<undefined>> => {
  const inputs = managedImageDefaultReconciliationInputsCreate(entry)
  if (!inputs.success) return inputs
  if (entry.remote === undefined) return resultFailure("assetsCliUploadAll", "The matching asset had no remote asset")
  const reconciled = await client.assetOutputsSet(projectId, entry.remote.assetId, { outputs: inputs.data })
  if (!reconciled.success) return reconciled
  return { success: true, data: undefined }
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
  const remote = await remoteAssetHistoryManifestLoad({ client, projectId, environment })
  if (!remote.success) return { result: remote }
  const diff = assetDiffClassify({
    local: local.data.entries,
    remote: remote.data.entries,
  })
  if (!diff.success) return { result: diff }

  const wait = flagRead(parsed, "wait") || flagRead(parsed, "delete")
  const deleteLocal = flagRead(parsed, "delete")
  const dryRun = flagRead(parsed, "dry-run")
  const localEntries = diff.data.entries.filter((entry) => entry.local !== undefined)
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
      defaultReconciled: 0,
      defaultReconciliationsPending: 0,
    }
    return {
      result: { success: true, data: output },
      exitCode: 1,
      humanOutput: uploadAllHumanOutputRead(output),
    }
  }

  const actionableEntries = diff.data.entries.filter(
    (entry) =>
      entry.local !== undefined &&
      (entry.status === "new" ||
        entry.status === "changed" ||
        entry.status === "matching" ||
        entry.status === "metadata" ||
        entry.status === "needs-processing"),
  )
  const entries: UploadAllOutputEntry[] = []
  const altUpdatesPending = actionableEntries.filter(altUpdateRequired).length
  const defaultReconciliationsPending = actionableEntries.filter(managedImageDefaultReconciliationRequired).length
  let altUpdated = 0
  let defaultReconciled = 0
  let failed = false
  let targetEnvironmentId: string | undefined
  const targetEnvironmentIdRead = async (): Promise<Result<string>> => {
    if (targetEnvironmentId !== undefined) return { success: true, data: targetEnvironmentId }
    const targetEnvironment = await projectEnvironmentIdRead(client, projectId, environment, op)
    if (!targetEnvironment.success) return targetEnvironment
    targetEnvironmentId = targetEnvironment.data
    return { success: true, data: targetEnvironment.data }
  }
  const deletionEligibilityRead = async (
    entry: AssetDiffEntry,
    sourceRevisionId: string,
    refresh = false,
  ): Promise<ReturnType<AssetsApiClient["sourceRevisionDeletionEligibilityRead"]>> => {
    const cached = entry.remote?.deletionEligibility
    if (!refresh && cached !== null && cached !== undefined) return { success: true, data: cached }
    return client.sourceRevisionDeletionEligibilityRead(projectId, environment, sourceRevisionId)
  }
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
      const defaultReconciliationRequired = managedImageDefaultReconciliationRequired(entry)
      entries.push(
        uploadAllOutputEntryCreate(
          entry,
          entry.status === "matching" && !altUpdateRequired(entry) && !defaultReconciliationRequired
            ? "skipped"
            : "planned",
          {
            ...(altUpdateRequired(entry) ? altUpdateOutputDetailsCreate(entry, "planned") : {}),
            ...(defaultReconciliationRequired ? { defaultReconciliationPlanned: true } : {}),
            ...(entry.status === "needs-processing" ? { reprocessPlanned: true } : {}),
          },
        ),
      )
      continue
    }

    let altDetails: Partial<Omit<UploadAllOutputEntry, "status" | "class" | "sourcePath" | "logicalPath" | "action">> =
      {}
    if (
      altUpdateRequired(entry) &&
      (entry.status === "metadata" || entry.status === "matching" || entry.status === "needs-processing")
    ) {
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

    if (entry.status === "needs-processing") {
      const remoteAssetId = entry.remote?.assetId
      if (remoteAssetId === undefined) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...altDetails,
            reprocessFailed: true,
            error: `The asset needs processing. Run assets reprocess ${entry.logicalPath} --environment ${environment}`,
          }),
        )
        continue
      }
      const environmentId = await targetEnvironmentIdRead()
      if (!environmentId.success) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...altDetails,
            reprocessFailed: true,
            error: `${environmentId.errorMessage}. Run assets reprocess ${entry.logicalPath} --environment ${environment}`,
          }),
        )
        continue
      }
      const reprocessed = await client.assetReprocess(projectId, remoteAssetId, {
        environmentId: environmentId.data,
      })
      if (!reprocessed.success) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...altDetails,
            reprocessFailed: true,
            error: `${reprocessed.errorMessage}. Run assets reprocess ${entry.logicalPath} --environment ${environment}`,
          }),
        )
        continue
      }
      if (reprocessed.data.asset.id !== remoteAssetId) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...altDetails,
            reprocessFailed: true,
            error: `The reprocessed asset did not match the request. Run assets reprocess ${entry.logicalPath} --environment ${environment}`,
          }),
        )
        continue
      }
      const reprocessDetails = {
        ...altDetails,
        workflowId: reprocessed.data.workflowId,
        reprocessed: true,
      }
      let workflowStatus: string | undefined
      if (wait) {
        const workflow = await client.workflowWait(projectId, reprocessed.data.workflowId)
        if (!workflow.success) {
          failed = true
          entries.push(
            uploadAllOutputEntryCreate(entry, "failed", { ...reprocessDetails, error: workflow.errorMessage }),
          )
          continue
        }
        workflowStatus = workflow.data.status
        if (workflow.data.status !== "succeeded") {
          failed = true
          entries.push(
            uploadAllOutputEntryCreate(entry, "failed", {
              ...reprocessDetails,
              workflowStatus,
              error: `The reprocess workflow ended with status ${workflow.data.status}`,
            }),
          )
          continue
        }
      }
      if (!deleteLocal) {
        entries.push(
          uploadAllOutputEntryCreate(entry, "skipped", {
            ...reprocessDetails,
            ...(workflowStatus === undefined ? {} : { workflowStatus }),
          }),
        )
        continue
      }
      const sourceRevisionId = entry.remote?.currentSourceRevisionId
      if (sourceRevisionId === undefined) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...reprocessDetails,
            ...(workflowStatus === undefined ? {} : { workflowStatus }),
            eligible: false,
            error: "The asset needing processing had no source revision",
          }),
        )
        continue
      }
      const eligibility = await deletionEligibilityRead(entry, sourceRevisionId, true)
      if (!eligibility.success) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...reprocessDetails,
            ...(workflowStatus === undefined ? {} : { workflowStatus }),
            error: eligibility.errorMessage,
          }),
        )
        continue
      }
      if (eligibility.data.sourceRevisionId !== sourceRevisionId || !eligibility.data.eligible) {
        failed = true
        entries.push(
          uploadAllOutputEntryCreate(entry, "failed", {
            ...reprocessDetails,
            ...(workflowStatus === undefined ? {} : { workflowStatus }),
            eligible: false,
            error:
              eligibility.data.sourceRevisionId !== sourceRevisionId
                ? "The deletion eligibility revision did not match"
                : "The source revision was not eligible for local deletion",
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
            ...reprocessDetails,
            ...(workflowStatus === undefined ? {} : { workflowStatus }),
            eligible: true,
            deleted: false,
            error: deleted.errorMessage,
          }),
        )
        continue
      }
      entries.push(
        uploadAllOutputEntryCreate(entry, "skipped", {
          ...reprocessDetails,
          ...(workflowStatus === undefined ? {} : { workflowStatus }),
          eligible: true,
          deleted: true,
        }),
      )
      continue
    }

    if (entry.status === "matching") {
      const defaultReconciliationRequired = managedImageDefaultReconciliationRequired(entry)
      if (defaultReconciliationRequired) {
        const reconciled = await managedImageDefaultReconcile(client, projectId, entry)
        if (!reconciled.success) {
          failed = true
          entries.push(
            uploadAllOutputEntryCreate(entry, "failed", {
              ...altDetails,
              defaultReconciliationFailed: true,
              error: reconciled.errorMessage,
            }),
          )
          continue
        }
        defaultReconciled += 1
        altDetails = { ...altDetails, defaultReconciled: true }
      }
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
      const eligibility = await deletionEligibilityRead(entry, sourceRevisionId)
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
    defaultReconciled,
    defaultReconciliationsPending,
  }
  return {
    result: { success: true, data: output },
    exitCode: failed ? 1 : 0,
    humanOutput: uploadAllHumanOutputRead(output),
  }
}

const uploadsListCommandRun = async (
  parsed: ParsedCommand,
  client: AssetsApiClient,
  projectId: string,
): Promise<CommandOutput> => {
  if (parsed.subcommand !== "list") {
    return { result: resultFailure("assetsCliUploads", "Use uploads list") }
  }
  if (parsed.positionals.length !== 0) {
    return { result: resultFailure("assetsCliUploadsList", "The uploads list command takes no positional arguments") }
  }
  const allowed = optionAllowed(parsed, ["today", "days", "limit", "status"])
  if (!allowed.success) return { result: allowed }

  if (flagRead(parsed, "today") && optionRead(parsed, "days") !== undefined) {
    return { result: resultFailure("assetsCliUploadsList", "--today and --days cannot be used together") }
  }

  let limit: number | undefined
  if (optionRead(parsed, "limit") !== undefined) {
    const parsedLimit = numberRead(optionRead(parsed, "limit"), "limit", 1)
    if (!parsedLimit.success) return { result: parsedLimit }
    limit = parsedLimit.data
  }

  let days: number | undefined
  if (optionRead(parsed, "days") !== undefined) {
    const parsedDays = numberRead(optionRead(parsed, "days"), "days", 0)
    if (!parsedDays.success) return { result: parsedDays }
    days = parsedDays.data
  }

  let status: UploadStatus | undefined
  if (optionRead(parsed, "status") !== undefined) {
    const parsedStatus = v.safeParse(uploadStatusSchema, optionRead(parsed, "status"))
    if (!parsedStatus.success) {
      return { result: resultFailure("assetsCliUploadsList", "Invalid --status option") }
    }
    status = parsedStatus.output
  }

  const runResult = await uploadsListRun(client, projectId, {
    today: flagRead(parsed, "today"),
    ...(days === undefined ? {} : { days }),
    ...(limit === undefined ? {} : { limit }),
    ...(status === undefined ? {} : { status }),
  })
  if (!runResult.success) return { result: runResult }

  return {
    result: { success: true, data: { uploads: runResult.data.uploads } },
    humanOutput: runResult.data.humanOutput,
  }
}

const assetReprocessCommandValidate = (parsed: ParsedCommand): Result<undefined> => {
  const op = "assetsCliReprocess"
  const positional = positionalRequire(parsed, 1)
  if (!positional.success) return positional
  const allowed = optionAllowed(parsed, ["wait", "no-wait", "poll-interval"])
  if (!allowed.success) return allowed
  if (optionRead(parsed, "environment") === undefined) return resultFailure(op, "Reprocess requires --environment")
  if (flagRead(parsed, "wait") && flagRead(parsed, "no-wait"))
    return resultFailure(op, "--wait and --no-wait cannot be used together")
  if (optionRead(parsed, "poll-interval") !== undefined && !flagRead(parsed, "wait"))
    return resultFailure(op, "--poll-interval requires --wait")
  return { success: true, data: undefined }
}

const assetReprocessCommandRun = async (
  parsed: ParsedCommand,
  client: AssetsApiClient,
  projectId: string,
  environment: string,
): Promise<CommandOutput> => {
  const reference = parsed.positionals[0] ?? ""
  const targetEnvironment = await projectEnvironmentIdRead(client, projectId, environment, "assetsCliReprocess")
  if (!targetEnvironment.success) return { result: targetEnvironment }

  const assetId = await assetReferenceUniqueRead(client, projectId, reference)
  if (!assetId.success) return { result: assetId }
  const reprocessed = await client.assetReprocess(projectId, assetId.data, {
    environmentId: targetEnvironment.data,
  })
  if (!reprocessed.success) return { result: reprocessed }
  if (reprocessed.data.asset.id !== assetId.data)
    return { result: resultFailure("assetsCliReprocess", "The reprocessed asset did not match the request") }
  if (!flagRead(parsed, "wait") || flagRead(parsed, "no-wait")) return { result: reprocessed }

  const workflow = await client.workflowWait(projectId, reprocessed.data.workflowId)
  if (!workflow.success) return { result: workflow }
  return {
    result: { success: true, data: { ...reprocessed.data, workflow: workflow.data } },
    exitCode: workflow.data.status === "succeeded" ? 0 : 1,
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

const customDomainRead = (value: string): Result<string> => {
  const op = "assetsCliSettingsMigrate"
  if (value.length === 0 || /[/:?#@\\\s]/u.test(value)) return resultFailure(op, "--custom-domain must be a hostname")
  let url: URL
  try {
    url = new URL(`https://${value}`)
  } catch {
    return resultFailure(op, "--custom-domain must be a hostname")
  }
  if (
    url.hostname !== value.toLocaleLowerCase() ||
    url.port !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  )
    return resultFailure(op, "--custom-domain must be a hostname")
  return { success: true, data: url.hostname }
}

const publicBaseUrlAgrees = (publicBaseUrl: string, customDomain: string): boolean => {
  let url: URL
  try {
    url = new URL(publicBaseUrl)
  } catch {
    return false
  }
  return (
    url.protocol === "https:" &&
    url.hostname === customDomain &&
    url.port === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === ""
  )
}

type SettingsMigrationOptions = {
  r2Bucket?: string
  r2Prefix?: string
  publicBaseUrl?: string
  customDomain?: string
  zoneId?: string
  wranglerProfile?: string
  provisioningRequested: boolean
}

const settingsMigrationOptionsRead = (parsed: ParsedCommand): Result<SettingsMigrationOptions> => {
  const op = "assetsCliSettingsMigrate"
  const allowed = optionAllowed(parsed, [
    "r2-bucket",
    "r2-prefix",
    "public-base-url",
    "create-bucket",
    "custom-domain",
    "zone-id",
    "wrangler-profile",
    "apply",
    "wait",
    "no-wait",
    "poll-interval",
  ])
  if (!allowed.success) return allowed
  if (flagRead(parsed, "wait") && flagRead(parsed, "no-wait"))
    return resultFailure(op, "--wait and --no-wait cannot be used together")
  if (flagRead(parsed, "wait") && !flagRead(parsed, "apply")) return resultFailure(op, "--wait requires --apply")
  if (optionRead(parsed, "poll-interval") !== undefined && !flagRead(parsed, "wait"))
    return resultFailure(op, "--poll-interval requires --wait")

  const r2Bucket = optionRead(parsed, "r2-bucket")
  const r2Prefix = optionRead(parsed, "r2-prefix")
  if (r2Prefix !== undefined) {
    const validPrefix = v.safeParse(r2PrefixSchema, r2Prefix)
    if (!validPrefix.success) return resultFailure(op, "The R2 prefix was invalid", v.summarize(validPrefix.issues))
  }
  const publicBaseUrl = optionRead(parsed, "public-base-url")
  const customDomainOption = optionRead(parsed, "custom-domain")
  const customDomain = customDomainOption === undefined ? undefined : customDomainRead(customDomainOption)
  if (customDomain !== undefined && !customDomain.success) return customDomain
  const customDomainValue = customDomain?.data
  if (flagRead(parsed, "create-bucket") && (r2Bucket === undefined || r2Bucket.length === 0))
    return resultFailure(op, "--create-bucket requires --r2-bucket")
  const zoneId = optionRead(parsed, "zone-id")
  if (customDomainValue !== undefined && (zoneId === undefined || zoneId.length === 0))
    return resultFailure(op, "--custom-domain requires --zone-id")
  if (zoneId !== undefined && (customDomainValue === undefined || zoneId.length === 0))
    return resultFailure(op, "--zone-id requires --custom-domain")
  const wranglerProfile = optionRead(parsed, "wrangler-profile")
  if (wranglerProfile !== undefined && wranglerProfile.length === 0)
    return resultFailure(op, "--wrangler-profile must not be empty")
  const provisioningRequested = flagRead(parsed, "create-bucket") || customDomainValue !== undefined
  if (wranglerProfile !== undefined && !provisioningRequested)
    return resultFailure(op, "--wrangler-profile requires --create-bucket or --custom-domain")
  if (r2Bucket !== undefined && r2Bucket.length === 0) return resultFailure(op, "--r2-bucket must not be empty")
  if (
    customDomainValue !== undefined &&
    publicBaseUrl !== undefined &&
    !publicBaseUrlAgrees(publicBaseUrl, customDomainValue)
  )
    return resultFailure(op, `--public-base-url must agree with https://${customDomainValue}`)

  return {
    success: true,
    data: {
      ...(r2Bucket === undefined ? {} : { r2Bucket }),
      ...(r2Prefix === undefined ? {} : { r2Prefix }),
      ...(publicBaseUrl === undefined ? {} : { publicBaseUrl }),
      ...(customDomainValue === undefined ? {} : { customDomain: customDomainValue }),
      ...(zoneId === undefined ? {} : { zoneId }),
      ...(wranglerProfile === undefined ? {} : { wranglerProfile }),
      provisioningRequested,
    },
  }
}

const storageMigrationIdempotencyKeyCreate = (
  projectId: string,
  environment: string,
  target: { r2Bucket?: string; r2Prefix?: string; publicBaseUrl?: string },
): string => {
  const digest = createHash("sha256").update(JSON.stringify({ projectId, environment, target })).digest("hex")
  return `assets-cli-migrate-${digest}`
}

const storageMigrationPostStartFailureCreate = (
  migrationId: string,
  failure: Extract<Result<unknown>, { success: false }>,
): Result<never> => {
  const raw = failure.rawData
  const rawObject = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined
  const nestedError =
    rawObject?.error && typeof rawObject.error === "object" ? (rawObject.error as Record<string, unknown>) : undefined
  const errorCodes = new Set([
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
  const code =
    typeof nestedError?.code === "string" && errorCodes.has(nestedError.code) ? nestedError.code : "internal_error"
  return resultFailure(failure.op, failure.errorMessage, {
    error: {
      code,
      retryable: typeof nestedError?.retryable === "boolean" ? nestedError.retryable : code === "internal_error",
      details: { migrationId },
    },
    ...(typeof rawObject?.requestId === "string" ? { requestId: rawObject.requestId } : {}),
  })
}

const storageMigrationWait = async (
  client: AssetsApiClient,
  projectId: string,
  environment: string,
  migrationId: string,
  sleep: (milliseconds: number) => Promise<void>,
  pollIntervalMilliseconds: number,
): Promise<Result<StorageMigrationStatusResponse>> => {
  const op = "assetsCliSettingsMigrateWait"
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await client.storageMigrationStatusRead(projectId, environment, migrationId)
    if (!status.success) return status
    if (["succeeded", "failed", "cancelled"].includes(status.data.status)) return status
    if (attempt < 59) await sleep(pollIntervalMilliseconds)
  }
  return resultFailure(op, "The storage migration did not finish before the polling limit")
}

const settingsMigrationCommandRun = async (
  parsed: ParsedCommand,
  client: AssetsApiClient,
  projectId: string,
  environment: string,
  wranglerRunner: WranglerCommandRunner,
  sleep: (milliseconds: number) => Promise<void>,
  pollIntervalMilliseconds: number,
): Promise<CommandOutput> => {
  const migrationOptions = settingsMigrationOptionsRead(parsed)
  if (!migrationOptions.success) return { result: migrationOptions }
  const { r2Bucket, r2Prefix, publicBaseUrl, customDomain, zoneId, wranglerProfile } = migrationOptions.data

  const target = {
    ...(r2Bucket === undefined ? {} : { r2Bucket }),
    ...(r2Prefix === undefined ? {} : { r2Prefix }),
    ...(publicBaseUrl === undefined && customDomain === undefined
      ? {}
      : { publicBaseUrl: publicBaseUrl ?? `https://${customDomain}` }),
  }
  const idempotencyKey = storageMigrationIdempotencyKeyCreate(projectId, environment, target)
  const plan = await client.storageMigrationPlan(projectId, environment, { ...target, idempotencyKey })
  if (!plan.success) return { result: plan }
  if (!flagRead(parsed, "apply")) return { result: plan }

  const provisioning = await wranglerProvisioningRun(wranglerRunner, {
    bucket: plan.data.targetBinding.bucket,
    createBucket: flagRead(parsed, "create-bucket"),
    ...(customDomain === undefined ? {} : { customDomain }),
    ...(zoneId === undefined ? {} : { zoneId }),
    ...(wranglerProfile === undefined ? {} : { profile: wranglerProfile }),
  })
  if (!provisioning.success) return { result: provisioning }

  const started = await client.storageMigrationStart(projectId, environment, {
    idempotencyKey: plan.data.idempotencyKey ?? idempotencyKey,
    sourceBinding: plan.data.sourceBinding,
    targetBinding: plan.data.targetBinding,
  })
  if (!started.success) return { result: started }

  const output = {
    plan: plan.data,
    provisioning: provisioning.data,
    accepted: started.data.accepted,
    migrationId: started.data.migrationId,
    workflowId: started.data.workflowId,
    migration: started.data.migration,
  }
  if (!flagRead(parsed, "wait") || flagRead(parsed, "no-wait"))
    return {
      result: { success: true, data: output },
      exitCode: ["failed", "cancelled"].includes(started.data.migration.status) ? 1 : 0,
    }
  const status = await storageMigrationWait(
    client,
    projectId,
    environment,
    started.data.migrationId,
    sleep,
    pollIntervalMilliseconds,
  )
  if (!status.success) return { result: storageMigrationPostStartFailureCreate(started.data.migrationId, status) }
  return {
    result: { success: true, data: { ...output, status: status.data } },
    exitCode: status.data.status === "succeeded" ? 0 : 1,
  }
}

const projectCreateOptionRead = (parsed: ParsedCommand, name: string): Result<string> => {
  const value = optionRead(parsed, name)
  if (value === undefined) return resultFailure("assetsCliProjectCreate", `Project creation requires --${name}`)
  return { success: true, data: value }
}

const projectCreateInputRead = (
  parsed: ParsedCommand,
  organization: OrganizationDefinition | undefined,
): Result<ProjectCreateCliInput> => {
  const op = "assetsCliProjectCreate"
  if (optionRead(parsed, "token") !== undefined)
    return resultFailure(op, "Tokens are not accepted as command arguments")
  if (organization === undefined)
    return resultFailure(op, "Project creation requires a resolved organization; use --organization")
  if (parsed.positionals.length !== 0)
    return resultFailure(op, "The projects create command takes no positional arguments")
  const allowed = optionAllowed(parsed, [
    "name",
    "slug",
    "default-environment",
    "service-project-id",
    "zitadel-project-id",
    "development-r2-bucket",
    "development-r2-prefix",
    "development-public-base-url",
    "production-r2-bucket",
    "production-r2-prefix",
    "production-public-base-url",
  ])
  if (!allowed.success) return allowed
  if (optionRead(parsed, "project") !== undefined)
    return resultFailure(op, "Use --service-project-id instead of --project for project creation")
  if (optionRead(parsed, "environment") !== undefined)
    return resultFailure(op, "Use --default-environment instead of --environment for project creation")

  const names = [
    "name",
    "slug",
    "default-environment",
    "service-project-id",
    "development-r2-bucket",
    "development-r2-prefix",
    "development-public-base-url",
    "production-r2-bucket",
    "production-r2-prefix",
    "production-public-base-url",
  ] as const
  const values = names.map((name) => [name, projectCreateOptionRead(parsed, name)] as const)
  const invalid = values.find(([, value]) => !value.success)
  if (invalid !== undefined && !invalid[1].success) return invalid[1]
  const valueRead = (name: (typeof names)[number]): string => {
    const value = values.find(([candidate]) => candidate === name)?.[1]
    return value?.success ? value.data : ""
  }
  const input = {
    organization,
    name: valueRead("name"),
    slug: valueRead("slug"),
    defaultEnvironment: valueRead("default-environment"),
    binding: {
      serviceProjectId: valueRead("service-project-id"),
      zitadelProjectId: optionRead(parsed, "zitadel-project-id"),
    },
    environments: [
      {
        name: "development" as const,
        r2Bucket: valueRead("development-r2-bucket"),
        r2Prefix: valueRead("development-r2-prefix"),
        publicBaseUrl: valueRead("development-public-base-url"),
      },
      {
        name: "production" as const,
        r2Bucket: valueRead("production-r2-bucket"),
        r2Prefix: valueRead("production-r2-prefix"),
        publicBaseUrl: valueRead("production-public-base-url"),
      },
    ],
  }
  const parsedInput = v.safeParse(projectCreateSchema, {
    ...input,
    binding: {
      ...input.binding,
      zitadelProjectId: input.binding.zitadelProjectId ?? "zitadel-project-pending",
    },
  })
  if (!parsedInput.success)
    return resultFailure(op, "The project creation input was invalid", v.summarize(parsedInput.issues))
  return {
    success: true,
    data: {
      ...parsedInput.output,
      binding: {
        ...parsedInput.output.binding,
        ...(input.binding.zitadelProjectId === undefined ? { zitadelProjectId: undefined } : {}),
      },
    },
  }
}

const commandRun = async (
  parsed: ParsedCommand,
  client: AssetsApiClient,
  config: CliConfig,
  env: NodeJS.ProcessEnv,
  stdin: () => Promise<string>,
  organization?: OrganizationDefinition,
  zitadelProjectCreate: ZitadelProjectCreate = zitadelProjectCreateDefault,
  wranglerRunner: WranglerCommandRunner = wranglerCommandRunnerProduction,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  pollIntervalMilliseconds = 1000,
): Promise<CommandOutput> => {
  const organizationId = organization?.id
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
    const selected = await projectAndEnvironmentRead(client, parsed, config, undefined, "configured", organizationId)
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
    if (parsed.positionals.length !== 0 && parsed.subcommand === "migrate")
      return {
        result: resultFailure("assetsCliSettingsMigrate", "The settings migrate command takes no positional arguments"),
      }
    if (parsed.positionals.length !== 0)
      return { result: resultFailure("assetsCliSettings", "The settings command takes no positional arguments") }
    if (parsed.subcommand === "read") {
      const allowed = optionAllowed(parsed, [])
      if (!allowed.success) return { result: allowed }
      const selected = await projectAndEnvironmentRead(
        client,
        parsed,
        config,
        undefined,
        "project-default",
        organizationId,
      )
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
      const selected = await projectAndEnvironmentRead(client, parsed, config, undefined, "configured", organizationId)
      if (!selected.success) return { result: selected }
      const settings = await client.projectSettingsRead(selected.data.projectId)
      if (!settings.success) return { result: settings }
      const update = projectSettingsUpdateRead(settings.data, environment, changes)
      if (!update.success) return { result: update }
      const written = await client.projectSettingsWrite(selected.data.projectId, update.data)
      if (!written.success) return { result: written }
      return { result: projectSettingsEnvironmentRead(written.data, environment, "assetsCliSettingsUpdate") }
    }
    if (parsed.subcommand === "migrate") {
      const environment = optionRead(parsed, "environment")
      if (environment === undefined)
        return { result: resultFailure("assetsCliSettingsMigrate", "Settings migrate requires --environment") }
      const migrationOptions = settingsMigrationOptionsRead(parsed)
      if (!migrationOptions.success) return { result: migrationOptions }
      const selected = await projectAndEnvironmentRead(client, parsed, config, undefined, "configured", organizationId)
      if (!selected.success) return { result: selected }
      if (selected.data.environment === undefined)
        return { result: resultFailure("assetsCliSettingsMigrate", "Settings migrate requires an environment") }
      return settingsMigrationCommandRun(
        parsed,
        client,
        selected.data.projectId,
        selected.data.environment,
        wranglerRunner,
        sleep,
        pollIntervalMilliseconds,
      )
    }
    return { result: resultFailure("assetsCliSettings", "Use settings read, update, or migrate") }
  }

  if (parsed.command === "projects") {
    if (parsed.subcommand === "archive" || parsed.subcommand === "unarchive") {
      if (parsed.positionals.length !== 0)
        return {
          result: resultFailure("assetsCliProjects", "The project archive command takes no positional arguments"),
        }
      const allowed = optionAllowed(parsed, [])
      if (!allowed.success) return { result: allowed }
      const selected = await projectAndEnvironmentRead(
        client,
        parsed,
        config,
        undefined,
        "project-default",
        organizationId,
        true,
      )
      if (!selected.success) return { result: selected }
      if (parsed.subcommand === "archive") {
        const result = await client.projectArchive(selected.data.projectId)
        if (!result.success) return { result }
        return {
          result,
          humanOutput: `Project ${result.data.project.name} archived. Deleted ${result.data.deletedObjectCount} R2 objects and ${result.data.deletedBuckets.length} buckets.\n`,
        }
      }
      const result = await client.projectUnarchive(selected.data.projectId)
      if (!result.success) return { result }
      return {
        result,
        humanOutput: `Project ${result.data.project.name} unarchived. Restored ${result.data.restoredOriginalCount} originals and regenerated ${result.data.regeneratedOutputCount} optimized assets.\n`,
      }
    }
    if (parsed.subcommand !== "create")
      return { result: resultFailure("assetsCliProjects", "Use projects create, archive, or unarchive") }
    const input = projectCreateInputRead(parsed, organization)
    if (!input.success) return { result: input }
    let projectInput = input.data
    if (projectInput.binding.zitadelProjectId === undefined) {
      const created = await zitadelProjectIdCreate(projectInput, env, zitadelProjectCreate)
      if (!created.success) return { result: created }
      projectInput = {
        ...projectInput,
        binding: { ...projectInput.binding, zitadelProjectId: created.data },
      }
    }
    return { result: await client.projectCreate(projectInput as ProjectCreate) }
  }

  if (
    ![
      "catalogs",
      "diff",
      "upload-all",
      "upload",
      "uploads",
      "reprocess",
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
  if (parsed.command === "reprocess") {
    const valid = assetReprocessCommandValidate(parsed)
    if (!valid.success) return { result: valid }
  }

  const projectRoot =
    parsed.command === "diff" || parsed.command === "upload-all" ? (parsed.positionals[0] ?? ".") : undefined
  const selected = await projectAndEnvironmentRead(client, parsed, config, projectRoot, "configured", organizationId)
  if (!selected.success) return { result: selected }
  const projectId = selected.data.projectId

  if (parsed.command === "catalogs") {
    if (parsed.subcommand !== "rebuild") return { result: resultFailure("assetsCliCatalogs", "Use catalogs rebuild") }
    if (parsed.positionals.length !== 0)
      return {
        result: resultFailure("assetsCliCatalogsRebuild", "The catalogs rebuild command takes no positional arguments"),
      }
    const allowed = optionAllowed(parsed, [])
    if (!allowed.success) return { result: allowed }
    if (selected.data.environment !== "production")
      return { result: resultFailure("assetsCliCatalogsRebuild", "Catalog rebuilds require --environment production") }
    return { result: await client.catalogProductionRebuild(projectId, selected.data.environment) }
  }

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
    const remote = await remoteAssetHistoryManifestLoad({ client, projectId, environment: selected.data.environment })
    if (!remote.success) return { result: remote }
    const diff = assetDiffClassify({ local: local.data.entries, remote: remote.data.entries })
    if (!diff.success) return { result: diff }
    const output = diffOutputCreate(configuration.data.root, selected.data.environment, diff.data)
    return {
      result: { success: true, data: output },
      exitCode: output.entries.every((entry) => entry.status === "matching") ? 0 : 1,
      humanOutput: diffHumanOutputRead(output),
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

  if (parsed.command === "uploads") {
    return uploadsListCommandRun(parsed, client, projectId)
  }

  if (parsed.command === "reprocess") {
    if (selected.data.environment === undefined)
      return { result: resultFailure("assetsCliReprocess", "Reprocess requires --environment") }
    return assetReprocessCommandRun(parsed, client, projectId, selected.data.environment)
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
      : /Parse|Validate|Target|Media|Command|Config|Environment|Organization|Project|Settings|SourceConfiguration|RootScan|Preflight|Diff/u.test(
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
  if (data && typeof data === "object" && "commands" in data && "globalOptions" in data) {
    return cliHelpFormat(data as typeof cliCommandHelp)
  }
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
  const versionRequested = flagRead(parsed.data, "version") || parsed.data.command === "version"
  if (versionRequested) {
    stdout(flagRead(parsed.data, "verbose") ? assetsCliVersionMetadataRender() : `assets ${packageVersion}\n`)
    return 0
  }
  if (flagRead(parsed.data, "help") || parsed.data.command === "help")
    return outputWrite({ result: { success: true, data: commandHelp } }, parsed.data.json, stdout, stderr)

  const isProjectCreate = parsed.data.command === "projects" && parsed.data.subcommand === "create"
  if (isProjectCreate && optionRead(parsed.data, "token") !== undefined)
    return outputWrite(
      { result: resultFailure("assetsCliProjectCreate", "Tokens are not accepted as command arguments") },
      parsed.data.json,
      stdout,
      stderr,
    )

  const explicitEnvFile = optionRead(parsed.data, "env-file")
  const hasProcessEnvFile = sourceEnv.ASSETS_ENV_FILE !== undefined && sourceEnv.ASSETS_ENV_FILE.length > 0
  let projectCreateEnvFile: string | undefined

  if (isProjectCreate && explicitEnvFile === undefined && !hasProcessEnvFile) {
    const readResult = await projectCreateEnvironmentFileRead({ env: sourceEnv })
    if (!readResult.success) return outputWrite({ result: readResult }, parsed.data.json, stdout, stderr)
    projectCreateEnvFile = readResult.data.path
  }

  const resolvedEnvFile = explicitEnvFile ?? (isProjectCreate ? projectCreateEnvFile : undefined)
  const commandRoot = commandRootRead(parsed.data)
  const environmentResult = await environmentConfigurationResolve({
    env: sourceEnv,
    ...(resolvedEnvFile === undefined ? {} : { envFile: resolvedEnvFile }),
    ...(commandRoot === undefined ? {} : { commandRoot }),
  })
  if (!environmentResult.success) return outputWrite({ result: environmentResult }, parsed.data.json, stdout, stderr)

  const env: NodeJS.ProcessEnv = {
    ...environmentResult.data.environment,
    ...(optionRead(parsed.data, "config") === undefined
      ? {}
      : { ASSETS_CONFIG_FILE: optionRead(parsed.data, "config") }),
    ...(optionRead(parsed.data, "session") === undefined
      ? {}
      : { ASSETS_SESSION_FILE: optionRead(parsed.data, "session") }),
  }

  const configCommand = parsed.data.command === "config"
  const globalConfiguration = configCommand ? await configShowGlobalRead(sourceEnv) : undefined
  if (globalConfiguration !== undefined && !globalConfiguration.success)
    return outputWrite({ result: globalConfiguration }, parsed.data.json, stdout, stderr)
  const configResult = await configRead(env, sourceEnv)
  if (!configResult.success && (!configCommand || globalConfiguration?.data === null))
    return outputWrite({ result: configResult }, parsed.data.json, stdout, stderr)
  const savedConfig: CliConfig = configResult.success ? (configResult.data ?? {}) : {}
  const projectEnvironment = environmentValueRead(sourceEnv, environmentResult.data.fileEnvironment, [
    "ASSETS_PROJECT",
    "ASSETS_PROJECT_ID",
  ])
  const config: CliConfig = {
    ...savedConfig,
    ...(projectEnvironment.value === undefined ? {} : { project: projectEnvironment.value }),
    ...(env.ASSETS_ENVIRONMENT === undefined ? {} : { environment: env.ASSETS_ENVIRONMENT }),
  }
  const organizationResult = await organizationConfigurationResolve({
    env: sourceEnv,
    ...(optionRead(parsed.data, "organization") === undefined
      ? {}
      : { organization: optionRead(parsed.data, "organization") }),
    ...(resolvedEnvFile === undefined ? {} : { envFile: resolvedEnvFile }),
    ...(commandRoot === undefined ? {} : { commandRoot }),
  })
  if (!organizationResult.success) return outputWrite({ result: organizationResult }, parsed.data.json, stdout, stderr)
  if (configCommand) {
    if (globalConfiguration === undefined || !globalConfiguration.success)
      return outputWrite(
        { result: resultFailure("assetsCliConfigShow", "Global configuration diagnostics were unavailable") },
        parsed.data.json,
        stdout,
        stderr,
      )
    const command = await configShowCommandRun({
      parsed: parsed.data,
      sourceEnvironment: sourceEnv,
      environment: environmentResult.data,
      commandRoot,
      savedConfig,
      organization: organizationResult.data,
      globalConfiguration: globalConfiguration.data,
    })
    return outputWrite(command, parsed.data.json, stdout, stderr)
  }
  const apiUrlEnvironment = environmentValueRead(sourceEnv, environmentResult.data.fileEnvironment, ["ASSETS_API_URL"])
  const apiUrl = optionRead(parsed.data, "api-url") ?? apiUrlEnvironment.value ?? config.apiUrl
  if (apiUrl === undefined)
    return outputWrite(
      { result: resultFailure("assetsCliConfig", "Set ASSETS_API_URL or --api-url") },
      parsed.data.json,
      stdout,
      stderr,
    )
  const sessionResult = await sessionRead(env)
  if (!sessionResult.success) return outputWrite({ result: sessionResult }, parsed.data.json, stdout, stderr)
  const accessTokenEnvironment = environmentValueRead(sourceEnv, environmentResult.data.fileEnvironment, [
    "ASSETS_TOKEN",
    "ASSETS_ACCESS_TOKEN",
  ])
  const accessToken = accessTokenEnvironment.value ?? sessionResult.data?.accessToken
  const pollInterval = optionRead(parsed.data, "poll-interval")
  const parsedPollInterval =
    pollInterval === undefined ? undefined : numberRead(pollInterval, "poll-interval", 0, 3600000)
  if (parsedPollInterval !== undefined && !parsedPollInterval.success)
    return outputWrite({ result: parsedPollInterval }, parsed.data.json, stdout, stderr)
  const sleep =
    options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const clientResult = assetsApiClientCreate({
    apiUrl,
    ...(accessToken === undefined ? {} : { accessToken }),
    ...(env.ASSETS_SESSION_COOKIE === undefined ? {} : { sessionCookie: env.ASSETS_SESSION_COOKIE }),
    fetcher: options.fetcher,
    sleep,
    pollIntervalMilliseconds: parsedPollInterval?.data,
  })
  if (!clientResult.success) return outputWrite({ result: clientResult }, parsed.data.json, stdout, stderr)
  const command = await commandRun(
    parsed.data,
    clientResult.data,
    config,
    env,
    options.stdinRead ?? stdinRead,
    organizationResult.data.organization ?? undefined,
    options.zitadelProjectCreate ?? zitadelProjectCreateDefault,
    options.wranglerRunner ?? wranglerCommandRunnerProduction,
    sleep,
    parsedPollInterval?.data,
  )
  return outputWrite(command, parsed.data.json, stdout, stderr)
}

if (import.meta.main) process.exit(await assetsCliMain())
