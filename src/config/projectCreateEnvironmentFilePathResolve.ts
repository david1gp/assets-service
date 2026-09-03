import { homedir } from "node:os"
import { join } from "node:path"

export type ProjectCreateEnvironmentFilePathResolveOptions = {
  env?: NodeJS.ProcessEnv
  homeDirectory?: string
}

export const projectCreateEnvironmentFilePathResolve = (
  options: ProjectCreateEnvironmentFilePathResolveOptions = {},
): string => {
  const environment = options.env ?? process.env
  const homeDirectory = options.homeDirectory ?? environment.HOME ?? homedir()
  return join(homeDirectory, ".config", "assets-service", "project-create.env")
}
