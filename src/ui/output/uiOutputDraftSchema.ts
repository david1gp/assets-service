import * as v from "valibot"

import { outputFormatSchema } from "../../output/outputFormatSchema.js"

/**
 * One row of the output-set editor. Numbers stay strings while the user types so
 * a half-typed value does not collapse to zero; conversion happens on submit.
 */
export const uiOutputDraftSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1)),
  key: v.string(),
  width: v.string(),
  height: v.string(),
  format: v.union([outputFormatSchema, v.literal("woff2")]),
  quality: v.string(),
  aiLabel: v.picklist(["inherit", "on", "off"]),
})

export type UiOutputDraft = v.InferOutput<typeof uiOutputDraftSchema>
