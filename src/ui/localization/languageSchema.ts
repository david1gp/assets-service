import * as v from "valibot"

export const languageSchema = v.picklist(["en", "de"])
export type Language = v.InferOutput<typeof languageSchema>
