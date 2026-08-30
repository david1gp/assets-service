import { homedir } from "node:os"
import { join } from "node:path"

export type GlobalOrganizationConfigurationPathResolveOptions = {
  env?: NodeJS.ProcessEnv
  homeDirectory?: string
}

export const globalOrganizationConfigurationPathResolve = (
  options: GlobalOrganizationConfigurationPathResolveOptions = {},
): string => {
  const environment = options.env ?? process.env
  const homeDirectory = options.homeDirectory ?? environment.HOME ?? homedir()
  const configHome = environment.XDG_CONFIG_HOME || join(homeDirectory, ".config")
  return join(configHome, "assets-service", "config.json")
}
