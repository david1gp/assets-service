import { join, resolve } from "node:path"

export type EnvironmentFilePathResolveOptions = {
  env?: NodeJS.ProcessEnv
  envFile?: string
  commandRoot?: string
  workingDirectory?: string
}

const workingDirectoryRead = (environment: NodeJS.ProcessEnv, configured?: string): string => {
  const directory = configured ?? environment.PWD
  return directory === undefined || directory.length === 0 ? process.cwd() : resolve(directory)
}

export const environmentFilePathResolve = (options: EnvironmentFilePathResolveOptions = {}): string => {
  const environment = options.env ?? process.env
  const configuredPath = options.envFile ?? environment.ASSETS_ENV_FILE
  const workingDirectory = workingDirectoryRead(environment, options.workingDirectory)
  if (configuredPath !== undefined && configuredPath.length > 0) return resolve(workingDirectory, configuredPath)
  return join(resolve(workingDirectory, options.commandRoot ?? "."), ".env")
}
