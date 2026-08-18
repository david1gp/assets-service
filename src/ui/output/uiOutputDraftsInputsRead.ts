import * as v from "valibot"

import type { OutputDefinitionInput } from "../../api-client/outputDefinitionInputSchema.js"
import { outputSetRequestSchema } from "../../api-client/outputSetRequestSchema.js"
import type { AssetClass } from "../../schemas/assetClassSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { UiOutputDraft } from "./uiOutputDraftSchema.js"

const numberRead = (value: string): number | undefined => {
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

const draftInputRead = (draft: UiOutputDraft, assetClass: AssetClass): OutputDefinitionInput => {
  const key = draft.key.trim()
  if (assetClass === "video") return { kind: "video", key }
  if (assetClass === "font") return { kind: "font", key, format: "woff2" }
  const quality = numberRead(draft.quality)
  return {
    kind: "image",
    key,
    width: numberRead(draft.width) ?? Number.NaN,
    height: numberRead(draft.height) ?? Number.NaN,
    format: draft.format === "woff2" ? "webp" : draft.format,
    ...(quality === undefined ? {} : { quality }),
    ...(draft.aiLabel === "inherit" ? {} : { showAiLabel: draft.aiLabel === "on" }),
  }
}

/** Validates the whole editor at once and returns the request body it produces. */
export const uiOutputDraftsInputsRead = (
  drafts: readonly UiOutputDraft[],
  assetClass: AssetClass,
): Result<readonly OutputDefinitionInput[]> => {
  const op = "uiOutputDraftsInputsRead"
  const outputs = drafts.map((draft) => draftInputRead(draft, assetClass))
  const parsed = v.safeParse(outputSetRequestSchema, { outputs })
  if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), outputs)
  return { success: true, data: parsed.output.outputs }
}
