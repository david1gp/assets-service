import * as v from "valibot"

export const fontOutputFormatSchema = v.literal("woff2")

export type FontOutputFormat = v.InferOutput<typeof fontOutputFormatSchema>
