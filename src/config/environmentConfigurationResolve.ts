import { lstat } from "node:fs/promises"
import { join } from "node:path"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type EnvironmentFilePathResolveOptions, environmentFilePathResolve } from "./environmentFilePathResolve.js"
import { environmentFileRead } from "./environmentFileRead.js"
import { environmentValueRead } from "./environmentValueRead.js"

export type EnvironmentConfigurationResolveOptions = EnvironmentFilePathResolveOptions

export type EnvironmentConfiguration = {
  environment: NodeJS.ProcessEnv
  fileEnvironment: Readonly<Record<string, string>>
  envFilePath: string
  envFileLoaded: boolean
}

const environmentAliasGroups = [
  ["ASSETS_PROJECT", "ASSETS_PROJECT_ID"],
  ["ASSETS_TOKEN", "ASSETS_ACCESS_TOKEN"],
  ["ASSETS_CONFIG_FILE", "ASSETS_CONFIG_PATH", "ASSETS_CONFIG"],
  ["ASSETS_SESSION_FILE", "ASSETS_SESSION_PATH", "ASSETS_SESSION"],
] as const

const environmentDirectoryFilePathResolve = async (
  path: string,
  sourceEnvironment: NodeJS.ProcessEnv,
): Promise<Result<string>> => {
  const op = "environmentConfigurationResolve"
  try {
    if (!(await lstat(path)).isDirectory()) return { success: true, data: path }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return { success: true, data: path }
    return resultErrorCreate(op, `Could not inspect ${path}`)
  }

  const environment = sourceEnvironment.ASSETS_ENVIRONMENT === "production" ? "production" : "development"
  return { success: true, data: join(path, environment) }
}

// ASSETS_ORGANIZATION is intentionally excluded: organizationConfigurationResolve applies its documented
// option, selected-file, process, directory-mapping precedence separately.

// Generic environment values use process exports over the selected .env file; this keeps a checked-in .env from
// overriding credentials or other invocation-specific values. Organization selection has its own documented order.
export const environmentConfigurationResolve = async (
  options: EnvironmentConfigurationResolveOptions = {},
): Promise<Result<EnvironmentConfiguration>> => {
  const op = "environmentConfigurationResolve"
  const sourceEnvironment = options.env ?? process.env
  if (options.envFile !== undefined && options.envFile.length === 0)
    return resultErrorCreate(op, "The --env-file path was empty")

  const configuredPath = options.envFile ?? sourceEnvironment.ASSETS_ENV_FILE
  const explicitFile = configuredPath !== undefined && configuredPath.length > 0
  const initialEnvFilePath = environmentFilePathResolve(options)
  const selectedEnvFilePath = await environmentDirectoryFilePathResolve(initialEnvFilePath, sourceEnvironment)
  if (!selectedEnvFilePath.success) return selectedEnvFilePath
  let envFilePath = selectedEnvFilePath.data
  let file = await environmentFileRead(envFilePath, { required: explicitFile })
  if (!file.success) return file
  if (file.data === null && !explicitFile && options.commandRoot !== undefined) {
    const initialWorkingDirectoryFilePath = environmentFilePathResolve({ ...options, commandRoot: undefined })
    const selectedWorkingDirectoryFilePath = await environmentDirectoryFilePathResolve(
      initialWorkingDirectoryFilePath,
      sourceEnvironment,
    )
    if (!selectedWorkingDirectoryFilePath.success) return selectedWorkingDirectoryFilePath
    const workingDirectoryFilePath = selectedWorkingDirectoryFilePath.data
    if (workingDirectoryFilePath !== envFilePath) {
      const workingDirectoryFile = await environmentFileRead(workingDirectoryFilePath)
      if (!workingDirectoryFile.success) return workingDirectoryFile
      if (workingDirectoryFile.data !== null) {
        envFilePath = workingDirectoryFilePath
        file = workingDirectoryFile
      }
    }
  }
  const fileEnvironment = file.data ?? {}
  const environment: NodeJS.ProcessEnv = { ...fileEnvironment }
  for (const [key, value] of Object.entries(sourceEnvironment)) {
    if (value !== undefined) environment[key] = value
  }
  for (const aliases of environmentAliasGroups) {
    const selected = environmentValueRead(sourceEnvironment, fileEnvironment, aliases)
    if (selected.source !== "process-environment") continue
    for (const alias of aliases) delete environment[alias]
    for (const alias of aliases) {
      const value = sourceEnvironment[alias]
      if (value !== undefined) environment[alias] = value
    }
  }
  return {
    success: true,
    data: {
      environment,
      fileEnvironment,
      envFilePath,
      envFileLoaded: file.data !== null,
    },
  }
}
