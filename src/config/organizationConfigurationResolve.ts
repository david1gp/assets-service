import { resolve } from "node:path"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { directoryOrganizationResolve } from "./directoryOrganizationResolve.js"
import {
  type EnvironmentConfigurationResolveOptions,
  environmentConfigurationResolve,
} from "./environmentConfigurationResolve.js"
import { globalOrganizationConfigurationRead } from "./globalOrganizationConfigurationRead.js"
import type { GlobalOrganizationConfiguration } from "./globalOrganizationConfigurationSchema.js"
import type { OrganizationDefinition } from "./organizationDefinitionSchema.js"

export type OrganizationConfigurationResolveOptions = EnvironmentConfigurationResolveOptions & {
  organization?: string
  homeDirectory?: string
}

export type OrganizationConfigurationSource =
  | "option"
  | "env-file"
  | "process-environment"
  | "directory-mapping"
  | "unrestricted"

export type OrganizationConfiguration = {
  organization: OrganizationDefinition | null
  source: OrganizationConfigurationSource
}

const organizationSelectorRead = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  const selector = value.trim()
  return selector.length === 0 ? undefined : selector
}

const organizationFind = (
  selector: string,
  configuration: GlobalOrganizationConfiguration,
): OrganizationDefinition | null => {
  const named = Object.hasOwn(configuration.organizations, selector)
    ? configuration.organizations[selector as keyof typeof configuration.organizations]
    : undefined
  if (named !== undefined) return named
  for (const organization of Object.values(configuration.organizations)) {
    if (organization.id === selector || organization.slug === selector) return organization
  }
  return null
}

const organizationSelectedRead = (
  options: OrganizationConfigurationResolveOptions,
  fileEnvironment: Readonly<Record<string, string>>,
  sourceEnvironment: NodeJS.ProcessEnv,
): {
  selector: string
  source: Exclude<OrganizationConfigurationSource, "directory-mapping" | "unrestricted">
} | null => {
  const option = organizationSelectorRead(options.organization)
  if (option !== undefined) return { selector: option, source: "option" }
  const file = organizationSelectorRead(fileEnvironment.ASSETS_ORGANIZATION)
  if (file !== undefined) return { selector: file, source: "env-file" }
  const process = organizationSelectorRead(sourceEnvironment.ASSETS_ORGANIZATION)
  if (process !== undefined) return { selector: process, source: "process-environment" }
  return null
}

// Organization precedence is intentionally: --organization, selected .env ASSETS_ORGANIZATION, exported process
// ASSETS_ORGANIZATION, global directory mapping, then unrestricted resolution. ZITADEL_ORGANIZATION_ID is not read.
export const organizationConfigurationResolve = async (
  options: OrganizationConfigurationResolveOptions = {},
): Promise<Result<OrganizationConfiguration>> => {
  const op = "organizationConfigurationResolve"
  const sourceEnvironment = options.env ?? process.env
  const homeDirectory = options.homeDirectory ?? sourceEnvironment.HOME
  if (options.organization !== undefined && organizationSelectorRead(options.organization) === undefined)
    return resultErrorCreate(op, "The --organization value was empty")
  const environment = await environmentConfigurationResolve(options)
  if (!environment.success) return environment
  const global = await globalOrganizationConfigurationRead({
    env: sourceEnvironment,
    ...(homeDirectory === undefined ? {} : { homeDirectory }),
  })
  if (!global.success) return global

  const selected = organizationSelectedRead(options, environment.data.fileEnvironment, sourceEnvironment)
  if (selected !== null) {
    if (global.data === null)
      return resultErrorCreate(
        op,
        `The organization ${selected.selector} was not configured in the global configuration`,
      )
    const organization = organizationFind(selected.selector, global.data)
    if (organization === null) return resultErrorCreate(op, `The organization ${selected.selector} was not configured`)
    return { success: true, data: { organization, source: selected.source } }
  }

  if (global.data === null) return { success: true, data: { organization: null, source: "unrestricted" } }
  const workingDirectory = resolve(options.workingDirectory ?? sourceEnvironment.PWD ?? process.cwd())
  const directory =
    options.commandRoot === undefined ? workingDirectory : resolve(workingDirectory, options.commandRoot)
  const mapped = directoryOrganizationResolve(directory, global.data, {
    ...(homeDirectory === undefined ? {} : { homeDirectory }),
  })
  if (!mapped.success) return mapped
  return mapped.data === null
    ? { success: true, data: { organization: null, source: "unrestricted" } }
    : { success: true, data: { organization: mapped.data, source: "directory-mapping" } }
}
