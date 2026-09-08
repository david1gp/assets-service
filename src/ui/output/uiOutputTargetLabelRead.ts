import type { OutputDefinition } from "../../output/outputDefinitionSchema.js"
import { ttc } from "../localization/ttc.js"

/**
 * Builds the chip label of one output target from its structured properties.
 * The output key is never parsed, so a key that looks like a path stays out of the label.
 */
export const uiOutputTargetLabelRead = (definition: OutputDefinition): string => {
  if (definition.kind === "image") return `${definition.width}×${definition.height} ${definition.format.toUpperCase()}`
  if (definition.kind === "font") return definition.format.toUpperCase()
  if (definition.kind === "video") return ttc("Video", "Video")
  return ttc("Document", "Dokument")
}
