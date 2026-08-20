import type { OutputDefinitionInput } from "../../api-client/outputDefinitionInputSchema.js"
import type { OutputDefinition } from "../../output/outputDefinitionSchema.js"

export type UiOutputSetChanges = {
  removedKeys: readonly string[]
  rebuiltKeys: readonly string[]
  addedKeys: readonly string[]
  isDestructive: boolean
}

const shapeRead = (definition: OutputDefinition | OutputDefinitionInput): string =>
  definition.kind === "image"
    ? `image:${definition.width}x${definition.height}:${definition.format}:${definition.quality ?? ""}:${definition.showAiLabel ?? ""}`
    : definition.kind === "font"
      ? `font:${definition.format}`
      : definition.kind === "document"
        ? "document"
        : "video"

/**
 * Compares the editor state against the stored definitions. Removals drop
 * published objects and shape changes rebuild them, so both need confirmation.
 */
export const uiOutputSetChangesRead = (
  current: readonly OutputDefinition[],
  next: readonly OutputDefinitionInput[],
): UiOutputSetChanges => {
  const nextKeys = new Set(next.map((output) => output.key))
  const removedKeys = current.filter((definition) => !nextKeys.has(definition.key)).map((definition) => definition.key)
  const rebuiltKeys = next
    .filter((output) => {
      const existing = current.find((definition) => definition.key === output.key)
      return existing !== undefined && shapeRead(existing) !== shapeRead(output)
    })
    .map((output) => output.key)
  const currentKeys = new Set(current.map((definition) => definition.key))
  const addedKeys = next.filter((output) => !currentKeys.has(output.key)).map((output) => output.key)
  return {
    removedKeys,
    rebuiltKeys,
    addedKeys,
    isDestructive: removedKeys.length > 0 || rebuiltKeys.length > 0,
  }
}
