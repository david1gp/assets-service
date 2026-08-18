import * as v from "valibot"

export const authenticationMethodSchema = v.picklist(["human_session", "service_account"])

export type AuthenticationMethod = v.InferOutput<typeof authenticationMethodSchema>
