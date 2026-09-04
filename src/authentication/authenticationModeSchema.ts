import * as v from "valibot"

export const authenticationModeSchema = v.picklist(["admin", "contributor"])

export type AuthenticationMode = v.InferOutput<typeof authenticationModeSchema>
