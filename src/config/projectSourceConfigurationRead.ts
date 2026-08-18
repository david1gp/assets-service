import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ProjectSourceConfigurationInput } from "./projectSourceConfigurationInputSchema.js"
import { projectSourceConfigurationInputSchema } from "./projectSourceConfigurationInputSchema.js"
import { projectSourceConfigurationMerge } from "./projectSourceConfigurationMerge.js"
import { projectSourceConfigurationResolve } from "./projectSourceConfigurationResolve.js"
import type { ProjectSourceConfiguration } from "./projectSourceConfigurationSchema.js"

export const projectSourceConfigurationRead = async (
  projectRoot: string,
  overrides: ProjectSourceConfigurationInput = {},
): Promise<Result<{ root: string; sourceDirectories: ProjectSourceConfiguration }>> => {
  const op = "projectSourceConfigurationRead"
  const root = resolve(projectRoot)
  const configurationPath = join(root, "assets.config.json")
  let content: string
  try {
    content = await readFile(configurationPath, "utf8")
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") content = "{}"
    else return resultErrorCreate(op, `Could not read ${configurationPath}`)
  }

  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return resultErrorCreate(op, `The JSON file ${configurationPath} was invalid`)
  }
  const configuration = v.safeParse(projectSourceConfigurationInputSchema, value)
  if (!configuration.success)
    return resultErrorCreate(
      op,
      `The JSON file ${configurationPath} did not match its schema`,
      v.summarize(configuration.issues),
    )
  const parsedOverrides = v.safeParse(projectSourceConfigurationInputSchema, overrides)
  if (!parsedOverrides.success)
    return resultErrorCreate(op, "The source directory overrides were invalid", v.summarize(parsedOverrides.issues))
  const resolved = projectSourceConfigurationResolve(
    root,
    projectSourceConfigurationMerge(configuration.output, parsedOverrides.output),
  )
  if (!resolved.success) return resolved
  return { success: true, data: { root, sourceDirectories: resolved.data } }
}
