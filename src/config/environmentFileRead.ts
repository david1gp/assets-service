import { readFile } from "node:fs/promises"
import { parseEnv } from "node:util"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export type EnvironmentFileReadOptions = {
  required?: boolean
}

export const environmentFileRead = async (
  path: string,
  options: EnvironmentFileReadOptions = {},
): Promise<Result<Record<string, string> | null>> => {
  const op = "environmentFileRead"
  let content: string
  try {
    content = await readFile(path, "utf8")
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT" && !options.required)
      return { success: true, data: null }
    return resultErrorCreate(op, `Could not read ${path}`)
  }

  let parsed: NodeJS.Dict<string>
  try {
    parsed = parseEnv(content)
  } catch {
    return resultErrorCreate(op, `The environment file ${path} was invalid`)
  }
  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) values[key] = value
  }
  return { success: true, data: values }
}
