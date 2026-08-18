import { readFile } from "node:fs/promises"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export const catalogListsCheck = async (
  files: { imageListPath: string; videoListPath: string; fontListPath: string },
  rendered: { imageList: string; videoList: string; fontList: string },
): Promise<Result<boolean>> => {
  const op = "catalogListsCheck"
  for (const [filePath, expected] of [
    [files.imageListPath, rendered.imageList],
    [files.videoListPath, rendered.videoList],
    [files.fontListPath, rendered.fontList],
  ] as const) {
    let actual: string
    try {
      actual = await readFile(filePath, "utf8")
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined
      if (code === "ENOENT") return { success: true, data: false }
      return resultErrorCreate(op, error instanceof Error ? error.message : String(error), { filePath })
    }

    if (actual !== expected) return { success: true, data: false }
  }

  return { success: true, data: true }
}
