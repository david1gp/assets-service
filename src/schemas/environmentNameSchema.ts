import * as v from "valibot"

export const environmentNameSchema = v.picklist(["development", "production"])

export type EnvironmentName = v.InferOutput<typeof environmentNameSchema>
