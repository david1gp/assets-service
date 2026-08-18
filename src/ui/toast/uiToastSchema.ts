import * as v from "valibot"

export const uiToastSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1)),
  tone: v.picklist(["positive", "negative"]),
  title: v.pipe(v.string(), v.minLength(1)),
  description: v.optional(v.string()),
})

export type UiToast = v.InferOutput<typeof uiToastSchema>
export type UiToastTone = UiToast["tone"]
