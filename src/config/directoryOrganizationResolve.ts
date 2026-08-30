import { homedir } from "node:os"
import { isAbsolute, relative, resolve, sep } from "node:path"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { GlobalOrganizationConfiguration } from "./globalOrganizationConfigurationSchema.js"
import type { OrganizationDefinition } from "./organizationDefinitionSchema.js"

export type DirectoryOrganizationResolveOptions = {
  homeDirectory?: string
}

const pathNormalize = (path: string, homeDirectory: string): string => {
  if (path === "~") return resolve(homeDirectory)
  if (path.startsWith("~/")) return resolve(homeDirectory, path.slice(2))
  return resolve(path)
}

const pathContains = (parent: string, candidate: string): boolean => {
  const path = relative(parent, candidate)
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

export const directoryOrganizationResolve = (
  directory: string,
  configuration: GlobalOrganizationConfiguration,
  options: DirectoryOrganizationResolveOptions = {},
): Result<OrganizationDefinition | null> => {
  const op = "directoryOrganizationResolve"
  if (directory.includes("\u0000")) return resultErrorCreate(op, "The directory path was invalid")

  const homeDirectory = options.homeDirectory ?? homedir()
  const candidate = pathNormalize(directory, homeDirectory)
  let match: { directory: string; organization: OrganizationDefinition } | undefined

  for (const [configuredDirectory, organizationName] of Object.entries(configuration.directoryMappings)) {
    if (configuredDirectory.includes("\u0000")) return resultErrorCreate(op, "The mapped directory path was invalid")
    const mappedDirectory = pathNormalize(configuredDirectory, homeDirectory)
    if (!pathContains(mappedDirectory, candidate)) continue

    const organization = configuration.organizations[organizationName]
    if (organization === undefined) return resultErrorCreate(op, `The organization ${organizationName} was not defined`)
    if (match === undefined || mappedDirectory.length > match.directory.length)
      match = { directory: mappedDirectory, organization }
  }

  return { success: true, data: match?.organization ?? null }
}
