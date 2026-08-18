#!/usr/bin/env bun
import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

import { apiFailureEnvelopeCreate } from "../api/apiFailureEnvelopeCreate.js"
import { apiSuccessEnvelopeCreate } from "../api/apiSuccessEnvelopeCreate.js"
import { jsonEnvelopeStringify } from "../api/jsonEnvelopeStringify.js"
import { assetsLocalServiceCreate } from "../local/assetsLocalServiceCreate.js"
import { localOutputPublisherFromEnvironment } from "../local/localOutputPublisherFromEnvironment.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

type ParsedLocalCommand = {
  command: string
  subcommand?: string
  positionals: string[]
  options: Record<string, string | true>
}

type CommandOutput = { result: Result<unknown>; exitCode?: number }

const valueOptions = new Set([
  "alt",
  "atomicity",
  "class",
  "document-list",
  "dir",
  "file",
  "folder",
  "format",
  "height",
  "image-list",
  "include",
  "integration-note",
  "key",
  "kind",
  "output-dir",
  "path",
  "quality",
  "references",
  "root",
  "search",
  "state",
  "to",
  "video-list",
  "font-list",
  "width",
])

const flagOptions = new Set(["check", "help", "json", "show-ai-label", "write"])

const commandHelp = {
  commands: [
    "doctor",
    "import <root>",
    "process",
    "upload <file> --path <class/folder/file> [--integration-note <text>]",
    "list [--kind image|video|font|document]",
    "show <asset-key>",
    "outputs list|add|remove|set <asset-key>",
    "metadata set|unset <asset-key>",
    "move <asset-key> --to <path>",
    "delete <asset-key>",
    "lists [--check]",
    "references",
  ],
  options: [
    "--root",
    "--state",
    "--output-dir",
    "--dir",
    "--image-list",
    "--video-list",
    "--font-list",
    "--document-list",
    "--integration-note",
    "--include",
    "--references",
    "--kind",
    "--class",
    "--search",
    "--folder",
    "--path",
    "--to",
    "--file",
    "--width",
    "--height",
    "--format",
    "--quality",
    "--key",
    "--alt",
    "--atomicity",
    "--show-ai-label",
    "--json",
    "--check",
    "--write",
  ],
}

const parsedCommandRead = (args: readonly string[]): Result<ParsedLocalCommand> => {
  const positionals: string[] = []
  const options: Record<string, string | true> = {}
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === undefined) continue
    if (!argument.startsWith("--")) {
      positionals.push(argument)
      continue
    }
    const raw = argument.slice(2)
    const equals = raw.indexOf("=")
    const name = equals < 0 ? raw : raw.slice(0, equals)
    const inlineValue = equals < 0 ? undefined : raw.slice(equals + 1)
    if (!valueOptions.has(name) && !flagOptions.has(name))
      return resultErrorCreate("assetsLocalParse", `Unknown option --${name}`)
    if (flagOptions.has(name)) {
      if (inlineValue !== undefined)
        return resultErrorCreate("assetsLocalParse", `Flag --${name} does not accept a value`)
      options[name] = true
      continue
    }
    const next = inlineValue ?? args[index + 1]
    if (name === "alt" && (next === undefined || next.startsWith("--"))) {
      options[name] = true
      continue
    }
    if (next === undefined || next.startsWith("--"))
      return resultErrorCreate("assetsLocalParse", `Option --${name} needs a value`)
    if (inlineValue === undefined) index += 1
    options[name] = next
  }
  const command = positionals.shift() ?? "help"
  const subcommand = command === "outputs" || command === "metadata" ? positionals.shift() : undefined
  return { success: true, data: { command, ...(subcommand === undefined ? {} : { subcommand }), positionals, options } }
}

const optionRead = (parsed: ParsedLocalCommand, name: string): string | undefined => {
  const value = parsed.options[name]
  return typeof value === "string" ? value : undefined
}

const flagRead = (parsed: ParsedLocalCommand, name: string): boolean => parsed.options[name] === true

const optionAllowed = (parsed: ParsedLocalCommand, allowed: readonly string[]): Result<undefined> => {
  const allowedSet = new Set(allowed)
  for (const name of Object.keys(parsed.options)) {
    if (name === "json" || name === "help" || name === "root" || name === "state" || name === "output-dir") continue
    if (!allowedSet.has(name))
      return resultErrorCreate("assetsLocalCommandValidate", `Option --${name} is not valid for this command`)
  }
  return { success: true, data: undefined }
}

const positionalsRequire = (parsed: ParsedLocalCommand, count: number): Result<readonly string[]> => {
  if (parsed.positionals.length !== count)
    return resultErrorCreate("assetsLocalValidate", "The command arguments were invalid")
  return { success: true, data: parsed.positionals }
}

const numberRead = (parsed: ParsedLocalCommand, name: string): Result<number> => {
  const value = optionRead(parsed, name)
  if (value === undefined || !/^\d+$/u.test(value))
    return resultErrorCreate("assetsLocalValidate", `--${name} must be a whole number`)
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1)
    return resultErrorCreate("assetsLocalValidate", `--${name} was invalid`)
  return { success: true, data: number }
}

type AssetsLocalCliOptions = {
  env?: NodeJS.ProcessEnv
  stdout?: (text: string) => void
  fetcher?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

export const assetsLocalCliMain = async (
  args = process.argv.slice(2),
  options: AssetsLocalCliOptions = {},
): Promise<number> => {
  const stdout = options.stdout ?? ((text: string) => process.stdout.write(text))
  const parsed = parsedCommandRead(args)
  if (!parsed.success) return outputWrite({ result: parsed }, stdout)
  if (parsed.data.command === "help" || flagRead(parsed.data, "help"))
    return outputWrite({ result: { success: true, data: commandHelp } }, stdout)

  const importRoot = parsed.data.command === "import" ? parsed.data.positionals[0] : undefined
  const sourceEnv = options.env ?? process.env
  const configuredRoot = optionRead(parsed.data, "root") ?? sourceEnv.ASSETS_LOCAL_ROOT
  const root = resolve(configuredRoot ?? importRoot ?? process.cwd())
  if (configuredRoot !== undefined && importRoot !== undefined && resolve(importRoot) !== root)
    return outputWrite(
      { result: resultErrorCreate("assetsLocalConfig", "--root and the import root must match") },
      stdout,
    )
  const statePath = resolve(
    optionRead(parsed.data, "state") ??
      sourceEnv.ASSETS_LOCAL_STATE_FILE ??
      join(root, ".assets-service", "state.json"),
  )
  const outputDirValue = optionRead(parsed.data, "output-dir") ?? sourceEnv.ASSETS_LOCAL_OUTPUT_DIR
  const publisher = localOutputPublisherFromEnvironment({ env: sourceEnv, fetcher: options.fetcher })
  if (!publisher.success) return outputWrite({ result: publisher }, stdout)
  const service = assetsLocalServiceCreate({
    root,
    statePath,
    ...(outputDirValue === undefined ? {} : { outputDir: outputDirValue }),
    ...(publisher.data === null ? {} : { outputPublisher: publisher.data }),
    remoteRequired: true,
  })
  const command = await localCommandRun(parsed.data, service, root)
  return outputWrite(command, stdout)
}

async function localCommandRun(
  parsed: ParsedLocalCommand,
  service: ReturnType<typeof assetsLocalServiceCreate>,
  root: string,
): Promise<CommandOutput> {
  if (parsed.command === "doctor") {
    const valid = positionalsRequire(parsed, 0)
    if (!valid.success) return { result: valid }
    const allowed = optionAllowed(parsed, [])
    if (!allowed.success) return { result: allowed }
    const result = await service.doctor()
    return result.success ? { result, exitCode: result.data.ok ? 0 : 1 } : { result }
  }

  if (parsed.command === "import") {
    const positional = positionalsRequire(parsed, 1)
    if (!positional.success) return { result: positional }
    const allowed = optionAllowed(parsed, ["atomicity", "show-ai-label"])
    if (!allowed.success) return { result: allowed }
    const atomicity = optionRead(parsed, "atomicity")
    if (
      atomicity !== undefined &&
      atomicity !== "all_or_nothing" &&
      atomicity !== "partial" &&
      atomicity !== "best_effort"
    )
      return { result: resultErrorCreate("assetsLocalImport", "--atomicity must be all_or_nothing or best_effort") }
    const result = await service.importAssets(positional.data[0] ?? root, {
      ...(atomicity === "partial" || atomicity === "best_effort" ? { atomicity: "partial" as const } : {}),
      ...(flagRead(parsed, "show-ai-label") ? { showAiLabel: true } : {}),
    })
    return result.success ? { result, exitCode: result.data.conflicts.length === 0 ? 0 : 1 } : { result }
  }

  if (parsed.command === "process") {
    const valid = positionalsRequire(parsed, 0)
    if (!valid.success) return { result: valid }
    const allowed = optionAllowed(parsed, [])
    if (!allowed.success) return { result: allowed }
    return { result: await service.process() }
  }

  if (parsed.command === "upload") {
    const positional = positionalsRequire(parsed, 1)
    if (!positional.success) return { result: positional }
    const allowed = optionAllowed(parsed, ["path", "integration-note"])
    if (!allowed.success) return { result: allowed }
    const path = optionRead(parsed, "path")
    if (path === undefined) return { result: resultErrorCreate("assetsLocalUpload", "Upload requires --path") }
    const integrationNote = optionRead(parsed, "integration-note")
    return { result: await service.upload(positional.data[0] ?? "", path, integrationNote) }
  }

  if (parsed.command === "list") {
    const valid = positionalsRequire(parsed, 0)
    if (!valid.success) return { result: valid }
    const allowed = optionAllowed(parsed, ["kind", "class", "search", "folder", "include"])
    if (!allowed.success) return { result: allowed }
    const className = optionRead(parsed, "kind") ?? optionRead(parsed, "class")
    if (
      className !== undefined &&
      className !== "image" &&
      className !== "video" &&
      className !== "font" &&
      className !== "document"
    )
      return { result: resultErrorCreate("assetsLocalList", "--kind must be image, video, font, or document") }
    const include = optionRead(parsed, "include")
    if (
      include !== undefined &&
      !include
        .split(",")
        .map((value) => value.trim())
        .every((value) => ["outputs", "metadata", "history"].includes(value))
    )
      return { result: resultErrorCreate("assetsLocalList", "--include must contain outputs, metadata, or history") }
    if (
      optionRead(parsed, "class") !== undefined &&
      optionRead(parsed, "kind") !== undefined &&
      optionRead(parsed, "class") !== optionRead(parsed, "kind")
    )
      return { result: resultErrorCreate("assetsLocalList", "--class and --kind must match when both are provided") }
    return {
      result: await service.list({
        className,
        search: optionRead(parsed, "search"),
        folder: optionRead(parsed, "folder"),
        include: (include ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      }),
    }
  }

  if (parsed.command === "show") {
    const positional = positionalsRequire(parsed, 1)
    if (!positional.success) return { result: positional }
    const allowed = optionAllowed(parsed, [])
    if (!allowed.success) return { result: allowed }
    return { result: await service.show(positional.data[0] ?? "") }
  }

  if (parsed.command === "outputs") return outputsCommandRun(parsed, service)
  if (parsed.command === "metadata") return metadataCommandRun(parsed, service)

  if (parsed.command === "move") {
    const positional = positionalsRequire(parsed, 1)
    if (!positional.success) return { result: positional }
    const allowed = optionAllowed(parsed, ["to"])
    if (!allowed.success) return { result: allowed }
    const to = optionRead(parsed, "to")
    if (to === undefined) return { result: resultErrorCreate("assetsLocalMove", "Move requires --to") }
    return { result: await service.move(positional.data[0] ?? "", to) }
  }

  if (parsed.command === "delete") {
    const positional = positionalsRequire(parsed, 1)
    if (!positional.success) return { result: positional }
    const allowed = optionAllowed(parsed, [])
    if (!allowed.success) return { result: allowed }
    return { result: await service.remove(positional.data[0] ?? "") }
  }

  if (parsed.command === "lists") return listsCommandRun(parsed, service, root)
  if (parsed.command === "references" || parsed.command === "refs") {
    const valid = positionalsRequire(parsed, 0)
    if (!valid.success) return { result: valid }
    const allowed = optionAllowed(parsed, [
      "include",
      "references",
      "image-list",
      "video-list",
      "font-list",
      "document-list",
    ])
    if (!allowed.success) return { result: allowed }
    const locations = (optionRead(parsed, "include") ?? optionRead(parsed, "references") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    const generatedListPaths = ["image-list", "video-list", "font-list", "document-list"]
      .map((name) => optionRead(parsed, name))
      .filter((value): value is string => value !== undefined)
    return { result: await service.references(locations, generatedListPaths) }
  }
  return { result: resultErrorCreate("assetsLocalCommand", `Unknown command ${parsed.command}`) }
}

async function outputsCommandRun(
  parsed: ParsedLocalCommand,
  service: ReturnType<typeof assetsLocalServiceCreate>,
): Promise<CommandOutput> {
  const reference = parsed.positionals[0]
  if (reference === undefined) return { result: resultErrorCreate("assetsLocalOutputs", "An asset key was required") }
  if (parsed.subcommand === "list") {
    const valid = positionalsRequire(parsed, 1)
    if (!valid.success) return { result: valid }
    const allowed = optionAllowed(parsed, [])
    if (!allowed.success) return { result: allowed }
    return { result: await service.outputsList(reference) }
  }
  if (parsed.subcommand === "remove") {
    const valid = positionalsRequire(parsed, 2)
    if (!valid.success) return { result: valid }
    const allowed = optionAllowed(parsed, [])
    if (!allowed.success) return { result: allowed }
    const key = parsed.positionals[1]
    if (key === undefined)
      return { result: resultErrorCreate("assetsLocalOutputsRemove", "An output key was required") }
    return { result: await service.outputsRemove(reference, key) }
  }
  if (parsed.subcommand === "add") {
    const valid = positionalsRequire(parsed, 1)
    if (!valid.success) return { result: valid }
    const kind = optionRead(parsed, "kind") ?? "image"
    const allowed = optionAllowed(
      parsed,
      kind === "image" ? ["kind", "key", "width", "height", "format", "quality", "show-ai-label"] : ["kind", "key"],
    )
    if (!allowed.success) return { result: allowed }
    if (kind === "image") {
      const width = numberRead(parsed, "width")
      const height = numberRead(parsed, "height")
      const format = optionRead(parsed, "format")
      if (!width.success || !height.success || format === undefined)
        return {
          result: resultErrorCreate("assetsLocalOutputsAdd", "Image outputs require --width, --height, and --format"),
        }
      const key = optionRead(parsed, "key") ?? `${width.data}x${height.data}_${format}`
      return {
        result: await service.outputsAdd(reference, {
          kind: "image",
          key,
          width: width.data,
          height: height.data,
          format: format as "jpg" | "png" | "webp" | "avif",
          ...(optionRead(parsed, "quality") === undefined ? {} : { quality: Number(optionRead(parsed, "quality")) }),
          ...(flagRead(parsed, "show-ai-label") ? { showAiLabel: true } : {}),
        }),
      }
    }
    if (kind === "video")
      return {
        result: await service.outputsAdd(reference, { kind: "video", key: optionRead(parsed, "key") ?? "default" }),
      }
    if (kind === "font")
      return {
        result: await service.outputsAdd(reference, {
          kind: "font",
          key: optionRead(parsed, "key") ?? "default",
          format: "woff2",
        }),
      }
    return { result: resultErrorCreate("assetsLocalOutputsAdd", "The output kind was invalid") }
  }
  if (parsed.subcommand === "set") {
    const valid = positionalsRequire(parsed, 1)
    if (!valid.success) return { result: valid }
    const allowed = optionAllowed(parsed, ["file"])
    if (!allowed.success) return { result: allowed }
    const file = optionRead(parsed, "file")
    if (file === undefined)
      return { result: resultErrorCreate("assetsLocalOutputsSet", "Output replacement requires --file") }
    let value: unknown
    try {
      value = JSON.parse(await readFile(resolve(file), "utf8"))
    } catch {
      return { result: resultErrorCreate("assetsLocalOutputsSet", "The output JSON file was invalid") }
    }
    return { result: await service.outputsSet(reference, Array.isArray(value) ? value : [value]) }
  }
  return { result: resultErrorCreate("assetsLocalOutputs", "Use outputs list, add, remove, or set") }
}

async function metadataCommandRun(
  parsed: ParsedLocalCommand,
  service: ReturnType<typeof assetsLocalServiceCreate>,
): Promise<CommandOutput> {
  const reference = parsed.positionals[0]
  if (reference === undefined) return { result: resultErrorCreate("assetsLocalMetadata", "An asset key was required") }
  if (parsed.subcommand === "set") {
    const valid = positionalsRequire(parsed, 1)
    if (!valid.success) return { result: valid }
    const allowed = optionAllowed(parsed, ["alt"])
    if (!allowed.success) return { result: allowed }
    const alt = optionRead(parsed, "alt")
    if (alt === undefined) return { result: resultErrorCreate("assetsLocalMetadata", "Metadata set requires --alt") }
    return { result: await service.metadataSet(reference, alt) }
  }
  if (parsed.subcommand === "unset") {
    const valid = positionalsRequire(parsed, 1)
    if (!valid.success) return { result: valid }
    const allowed = optionAllowed(parsed, ["alt"])
    if (!allowed.success) return { result: allowed }
    if (!flagRead(parsed, "alt"))
      return { result: resultErrorCreate("assetsLocalMetadata", "Metadata unset requires --alt") }
    return { result: await service.metadataUnset(reference) }
  }
  return { result: resultErrorCreate("assetsLocalMetadata", "Use metadata set or unset") }
}

async function listsCommandRun(
  parsed: ParsedLocalCommand,
  service: ReturnType<typeof assetsLocalServiceCreate>,
  root: string,
): Promise<CommandOutput> {
  const valid = positionalsRequire(parsed, 0)
  if (!valid.success) return { result: valid }
  const allowed = optionAllowed(parsed, [
    "check",
    "dir",
    "image-list",
    "video-list",
    "font-list",
    "document-list",
    "write",
  ])
  if (!allowed.success) return { result: allowed }
  const directory = resolve(root, optionRead(parsed, "dir") ?? "src/app/assets")
  const files = {
    imageListPath: resolve(root, optionRead(parsed, "image-list") ?? join(directory, "imageList.ts")),
    videoListPath: resolve(root, optionRead(parsed, "video-list") ?? join(directory, "videoList.ts")),
    fontListPath: resolve(root, optionRead(parsed, "font-list") ?? join(directory, "fontList.ts")),
    documentListPath: resolve(root, optionRead(parsed, "document-list") ?? join(directory, "documentList.ts")),
  }
  const result = await service.lists({
    files,
    check: flagRead(parsed, "check"),
    write: flagRead(parsed, "write") || !flagRead(parsed, "check"),
  })
  if (!result.success || !flagRead(parsed, "check")) return { result }
  return { result, exitCode: result.data.matches ? 0 : 1 }
}

function outputWrite(output: CommandOutput, stdout: (text: string) => void): number {
  if (output.result.success) {
    stdout(jsonEnvelopeStringify(apiSuccessEnvelopeCreate(output.result.data)))
    return output.exitCode ?? 0
  }
  const error = failureRead(output.result)
  stdout(jsonEnvelopeStringify(apiFailureEnvelopeCreate(error)))
  return output.exitCode ?? 1
}

function failureRead(result: Extract<Result<unknown>, { success: false }>) {
  const raw = result.rawData
  const details = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined
  const validation = /invalid|requires|must|missing|failed|escaped|different|conflict|refus/u.test(
    `${result.op} ${result.errorMessage}`,
  )
  return {
    code: validation
      ? result.op.includes("Conflict") || result.errorMessage.includes("already")
        ? "conflict"
        : "validation_failed"
      : "internal_error",
    message: result.errorMessage,
    ...(details === undefined ? {} : { details }),
    retryable: false,
  } as const
}

if (import.meta.main) process.exit(await assetsLocalCliMain())
