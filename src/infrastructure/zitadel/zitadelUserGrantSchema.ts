import * as v from "valibot"

export const zitadelUserGrantSchema = v.object({
  projectId: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  orgId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  state: v.picklist(["USER_GRANT_STATE_ACTIVE", "USER_GRANT_STATE_INACTIVE"]),
  roleKeys: v.optional(v.array(v.string())),
  roles: v.optional(v.array(v.string())),
})

export type ZitadelUserGrant = v.InferOutput<typeof zitadelUserGrantSchema>
