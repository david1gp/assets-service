import { basename, dirname, extname, join } from "node:path"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export const imageSidecarAltRead = async (
  filePath: string,
): Promise<Result<{ alt: string | null; sidecarPath: string | null }>> => {
  const op = "imageSidecarAltRead"
  const stem = basename(filePath, extname(filePath))
  const directory = dirname(filePath)
  const sidecarPaths = [join(directory, `${stem}.md`), join(directory, `${stem}.txt`)]

  for (const sidecarPath of sidecarPaths) {
    let exists: boolean
    try {
      exists = await Bun.file(sidecarPath).exists()
    } catch {
      return resultErrorCreate(op, `Could not inspect sidecar file: ${sidecarPath}`)
    }
    if (!exists) continue

    let content: string
    try {
      content = await Bun.file(sidecarPath).text()
    } catch {
      return resultErrorCreate(op, `Could not read sidecar file: ${sidecarPath}`)
    }

    const alt = content.trim()
    if (alt.length > 10000)
      return resultErrorCreate(op, `Sidecar alt text exceeds the maximum length of 10000 characters: ${sidecarPath}`)

    return { success: true, data: { alt: alt || null, sidecarPath } }
  }

  return { success: true, data: { alt: null, sidecarPath: null } }
}
