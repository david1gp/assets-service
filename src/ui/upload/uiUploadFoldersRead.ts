import * as v from "valibot"
import { foldersSchema } from "../../asset/foldersSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"

/**
 * Turns up to three folder inputs into a validated folder list. Trailing empty
 * fields are dropped so zero, one, two, or three folders are all accepted.
 */
export const uiUploadFoldersRead = (inputs: readonly string[]): Result<string[]> => {
  const trimmed = inputs.map((input) => input.trim())
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") trimmed.pop()
  if (trimmed.some((segment) => segment === ""))
    return resultErrorCreate("uiUploadFoldersRead", "Folder levels must be filled from the top down")
  const parsed = v.safeParse(foldersSchema, trimmed)
  if (!parsed.success) return resultErrorCreate("uiUploadFoldersRead", "The folders were invalid")
  return { success: true, data: [...parsed.output] }
}
