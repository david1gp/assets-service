import { readFile } from "node:fs/promises"
import { parseEnv } from "node:util"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import {
  type ProjectCreateEnvironmentFilePathResolveOptions,
  projectCreateEnvironmentFilePathResolve,
} from "./projectCreateEnvironmentFilePathResolve.js"

export type ProjectCreateEnvironmentFileReadOptions = ProjectCreateEnvironmentFilePathResolveOptions

export const projectCreateEnvironmentFileRead = async (
  options: ProjectCreateEnvironmentFileReadOptions = {},
): Promise<Result<{ path: string; values: Record<string, string> }>> => {
  const op = "projectCreateEnvironmentFileRead"
  const path = projectCreateEnvironmentFilePathResolve(options)
  let content: string
  try {
    content = await readFile(path, "utf8")
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return resultErrorCreate(
        op,
        `Project creation environment file was not found at ${path}; provide --env-file, set ASSETS_ENV_FILE, or create ${path}`,
      )
    return resultErrorCreate(op, `Could not read project creation environment file at ${path}`)
  }

  if (content.includes("\u0000"))
    return resultErrorCreate(op, `The project creation environment file at ${path} was invalid`)

  let parsed: NodeJS.Dict<string>
  try {
    parsed = parseEnv(content)
  } catch {
    return resultErrorCreate(op, `The project creation environment file at ${path} was invalid`)
  }

  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) values[key] = value
  }
  return { success: true, data: { path, values } }
}
