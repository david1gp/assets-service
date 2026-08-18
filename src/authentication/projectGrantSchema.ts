import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { authenticationRoleSchema } from "./authenticationRoleSchema.js"

export const projectGrantSchema = v.strictObject({
  projectId: idSchema,
  roles: v.pipe(
    v.array(authenticationRoleSchema),
    v.minLength(1),
    v.check((roles) => new Set(roles).size === roles.length),
  ),
})

export type ProjectGrant = v.InferOutput<typeof projectGrantSchema>
