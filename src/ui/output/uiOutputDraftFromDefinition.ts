import type { OutputDefinition } from "../../output/outputDefinitionSchema.js"
import type { UiOutputDraft } from "./uiOutputDraftSchema.js"

/** Turns a stored output definition into an editable row of the output editor. */
export const uiOutputDraftFromDefinition = (definition: OutputDefinition): UiOutputDraft => ({
  id: definition.id,
  key: definition.key,
  width: definition.kind === "image" ? String(definition.width) : "",
  height: definition.kind === "image" ? String(definition.height) : "",
  format: definition.kind === "image" ? definition.format : definition.kind === "font" ? "woff2" : "webp",
  quality: definition.kind === "image" && definition.quality !== undefined ? String(definition.quality) : "",
  aiLabel:
    definition.kind === "image" && definition.showAiLabel !== undefined
      ? definition.showAiLabel
        ? "on"
        : "off"
      : "inherit",
})
