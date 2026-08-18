import { randomUUID } from "node:crypto"
import { mkdir, rename, rm } from "node:fs/promises"
import { dirname } from "node:path"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export const catalogListFileWrite = async (filePath: string, content: string): Promise<Result<undefined>> => {
  const op = "catalogListFileWrite"
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`

  try {
    await mkdir(dirname(filePath), { recursive: true })
    await Bun.write(temporaryPath, content)
    await rename(temporaryPath, filePath)
    return { success: true, data: undefined }
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error), { filePath })
  }
}
