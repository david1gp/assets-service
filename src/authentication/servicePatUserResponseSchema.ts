import * as v from "valibot"

export const servicePatUserResponseSchema = v.object({
  user: v.object({
    id: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
    state: v.literal("USER_STATE_ACTIVE"),
    details: v.object({
      resourceOwner: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
    }),
    machine: v.object({
      name: v.optional(v.string()),
    }),
  }),
})

export type ServicePatUserResponse = v.InferOutput<typeof servicePatUserResponseSchema>
