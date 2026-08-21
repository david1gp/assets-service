import * as v from "valibot"

export const sourceRevisionContentModeSchema = v.picklist(["preview", "download"])

export type SourceRevisionContentMode = v.InferOutput<typeof sourceRevisionContentModeSchema>
