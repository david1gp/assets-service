import * as v from "valibot"

import { authenticationRoleSchema } from "./authenticationRoleSchema.js"

export const servicePatGrantSearchResponseSchema = v.object({
  result: v.optional(
    v.array(
      v.object({
        projectId: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
        orgId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(256))),
        state: v.optional(v.string()),
        roleKeys: v.optional(v.array(v.string())),
        roles: v.optional(v.array(v.string())),
      }),
    ),
  ),
})

export type ServicePatGrantSearchResponse = v.InferOutput<typeof servicePatGrantSearchResponseSchema>
