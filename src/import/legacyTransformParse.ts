import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

type LegacyAiProvenance = "generated" | "enhanced" | null

type LegacyTransform = {
  width: number
  height: number
  format: "jpg" | "png" | "webp" | "avif"
  aiProvenance: LegacyAiProvenance
  normalized: string
}

export const legacyTransformParse = (segment: string): Result<LegacyTransform | null> => {
  const op = "legacyTransformParse"
  if (segment.length === 0 || !/^\d/.test(segment)) return { success: true, data: null }

  const match = /^(\d+)(?:(?:x|_)(\d+))?(?:_(jpg|png|webp|avif))?(?:_ai_(generated|modified|enhanced))?$/.exec(segment)
  if (match === null) return resultErrorCreate(op, `The transform folder is invalid: ${segment}`)

  const width = Number.parseInt(match[1] ?? "", 10)
  const height = Number.parseInt(match[2] ?? match[1] ?? "", 10)
  const format = (match[3] ?? "webp") as LegacyTransform["format"]
  const aiSuffix = match[4]
  const aiProvenance: LegacyAiProvenance =
    aiSuffix === "generated" ? "generated" : aiSuffix === "modified" || aiSuffix === "enhanced" ? "enhanced" : null

  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)
    return resultErrorCreate(op, `Transform dimensions must be greater than zero: ${segment}`)

  return {
    success: true,
    data: {
      width,
      height,
      format,
      aiProvenance,
      normalized: `${width}x${height}_${format}${aiProvenance ? `_ai_${aiProvenance === "enhanced" ? "enhanced" : "generated"}` : ""}`,
    },
  }
}
