import * as v from "valibot"

export const authenticationRoleSchema = v.picklist(["contributor", "admin"])

export type AuthenticationRole = v.InferOutput<typeof authenticationRoleSchema>
