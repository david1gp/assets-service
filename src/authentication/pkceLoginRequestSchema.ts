import * as v from "valibot"

export const pkceLoginRequestSchema = v.strictObject({
  returnTo: v.optional(
    v.pipe(
      v.string(),
      v.minLength(1),
      v.maxLength(2048),
      v.check((value) => value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")),
    ),
  ),
})

export type PkceLoginRequest = v.InferOutput<typeof pkceLoginRequestSchema>
