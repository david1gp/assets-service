import * as v from "valibot"

export const authenticationRoleSchema = v.picklist(["assets.uploader", "assets.admin"])

export type AuthenticationRole = v.InferOutput<typeof authenticationRoleSchema>
