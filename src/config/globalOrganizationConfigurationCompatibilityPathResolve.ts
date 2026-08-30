import { homedir } from "node:os"
import { join } from "node:path"

import type { GlobalOrganizationConfigurationPathResolveOptions } from "./globalOrganizationConfigurationPathResolve.js"

export const globalOrganizationConfigurationCompatibilityPathResolve = (
  options: GlobalOrganizationConfigurationPathResolveOptions = {},
): string => {
  const environment = options.env ?? process.env
  const homeDirectory = options.homeDirectory ?? environment.HOME ?? homedir()
  const configHome = environment.XDG_CONFIG_HOME || join(homeDirectory, ".config")
  return join(configHome, "assets", "config.json")
}
