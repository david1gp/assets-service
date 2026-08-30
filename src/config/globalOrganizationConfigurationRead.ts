import { readFile } from "node:fs/promises"
import * as v from "valibot"

import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { globalOrganizationConfigurationCompatibilityPathResolve } from "./globalOrganizationConfigurationCompatibilityPathResolve.js"
import {
  type GlobalOrganizationConfigurationPathResolveOptions,
  globalOrganizationConfigurationPathResolve,
} from "./globalOrganizationConfigurationPathResolve.js"
import {
  type GlobalOrganizationConfiguration,
  globalOrganizationConfigurationSchema,
} from "./globalOrganizationConfigurationSchema.js"

export type GlobalOrganizationConfigurationReadOptions = GlobalOrganizationConfigurationPathResolveOptions & {
  path?: string
}

const legacyCliConfigurationSchema = v.strictObject({
  apiUrl: v.optional(v.pipe(v.string(), v.url())),
  project: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(128))),
  environment: v.optional(environmentNameSchema),
})

const configurationFileRead = async (
  path: string,
  options: { ignoreLegacyCliConfiguration?: boolean } = {},
): Promise<Result<GlobalOrganizationConfiguration | null>> => {
  const op = "globalOrganizationConfigurationRead"
  let content: string
  try {
    content = await readFile(path, "utf8")
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return { success: true, data: null }
    return resultErrorCreate(op, `Could not read ${path}`)
  }

  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return resultErrorCreate(op, `The JSON file ${path} was invalid`)
  }

  const parsed = v.safeParse(globalOrganizationConfigurationSchema, value)
  if (parsed.success) return { success: true, data: parsed.output }

  if (options.ignoreLegacyCliConfiguration && v.safeParse(legacyCliConfigurationSchema, value).success)
    return { success: true, data: null }
  return resultErrorCreate(op, `The JSON file ${path} did not match its schema`, v.summarize(parsed.issues))
}

export const globalOrganizationConfigurationRead = async (
  options: GlobalOrganizationConfigurationReadOptions = {},
): Promise<Result<GlobalOrganizationConfiguration | null>> => {
  if (options.path !== undefined) return configurationFileRead(options.path)

  const canonicalPath = globalOrganizationConfigurationPathResolve(options)
  const canonical = await configurationFileRead(canonicalPath)
  if (!canonical.success || canonical.data !== null) return canonical

  return configurationFileRead(globalOrganizationConfigurationCompatibilityPathResolve(options), {
    ignoreLegacyCliConfiguration: true,
  })
}
