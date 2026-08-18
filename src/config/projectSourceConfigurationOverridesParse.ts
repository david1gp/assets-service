import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ProjectSourceConfigurationInput } from "./projectSourceConfigurationInputSchema.js"
import { projectSourceConfigurationInputSchema } from "./projectSourceConfigurationInputSchema.js"

const optionClasses = {
  "image-dir": "image",
  "video-dir": "video",
  "document-dir": "document",
  "font-dir": "font",
} as const

const disableOptions = {
  "no-image-dir": "image",
  "no-video-dir": "video",
  "no-document-dir": "document",
  "no-font-dir": "font",
} as const

const disabledValues = new Set(["none", "disabled"])

export const projectSourceConfigurationOverridesParse = (
  options: Readonly<Record<string, string | true>>,
): Result<ProjectSourceConfigurationInput> => {
  const op = "projectSourceConfigurationOverridesParse"
  const overrides: Record<string, string | null> = {}
  for (const [option, value] of Object.entries(options)) {
    const assetClass = optionClasses[option as keyof typeof optionClasses]
    const disabledClass = disableOptions[option as keyof typeof disableOptions]
    if (assetClass !== undefined) {
      if (Object.hasOwn(overrides, assetClass))
        return resultErrorCreate(op, `The source directory override for ${assetClass} was supplied more than once`)
      if (value === true) return resultErrorCreate(op, `--${option} needs a value`)
      overrides[assetClass] = disabledValues.has(value.toLocaleLowerCase()) ? null : value
      continue
    }
    if (disabledClass !== undefined) {
      if (value !== true) return resultErrorCreate(op, `Flag --${option} does not accept a value`)
      if (Object.hasOwn(overrides, disabledClass))
        return resultErrorCreate(op, `The source directory override for ${disabledClass} was supplied more than once`)
      overrides[disabledClass] = null
      continue
    }
    return resultErrorCreate(op, `Unknown source directory option --${option}`)
  }
  const parsed = v.safeParse(projectSourceConfigurationInputSchema, overrides)
  if (!parsed.success)
    return resultErrorCreate(op, "The source directory overrides were invalid", v.summarize(parsed.issues))
  return { success: true, data: parsed.output }
}
