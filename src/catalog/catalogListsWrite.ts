import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { catalogListFileWrite } from "./catalogListFileWrite.js"

export const catalogListsWrite = async (
  files: { imageListPath: string; videoListPath: string; fontListPath: string },
  rendered: { imageList: string; videoList: string; fontList: string },
): Promise<Result<undefined>> => {
  const op = "catalogListsWrite"
  for (const [filePath, content] of [
    [files.imageListPath, rendered.imageList],
    [files.videoListPath, rendered.videoList],
    [files.fontListPath, rendered.fontList],
  ] as const) {
    const written = await catalogListFileWrite(filePath, content)
    if (!written.success) return resultErrorCreate(op, written.errorMessage, written.rawData)
  }

  return { success: true, data: undefined }
}
