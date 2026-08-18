import * as v from "valibot"

export const zitadelDoctorCheckSchema = v.strictObject({
  name: v.picklist(["issuer", "discovery", "jwks", "machine_token"]),
  status: v.picklist(["ok", "failed", "skipped"]),
  message: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
})

export type ZitadelDoctorCheck = v.InferOutput<typeof zitadelDoctorCheckSchema>
