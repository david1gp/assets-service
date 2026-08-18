import * as v from "valibot"

import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { ZitadelGrantAdapter } from "./zitadelGrantAdapter.js"
import { type ZitadelGrantRequest, zitadelGrantRequestSchema } from "./zitadelGrantRequestSchema.js"

export const zitadelGrantAdapterMemoryCreate = (): ZitadelGrantAdapter => {
  const grants = new Map<string, ZitadelGrantRequest>()
  const keyCreate = (grant: ZitadelGrantRequest) =>
    `${grant.organizationId}/${grant.projectId}/${grant.subjectType}/${grant.subjectId}`
  const copy = (grant: ZitadelGrantRequest): ZitadelGrantRequest => ({ ...grant, roles: [...grant.roles] })

  return {
    async grant(input): Promise<Result<undefined>> {
      const parsed = v.safeParse(zitadelGrantRequestSchema, input)
      if (!parsed.success) return resultErrorCreate("zitadelGrantAdapterMemoryGrant", "The project grant was invalid")
      grants.set(keyCreate(parsed.output), copy(parsed.output))
      return { success: true, data: undefined }
    },
    async revoke(input): Promise<Result<undefined>> {
      const parsed = v.safeParse(zitadelGrantRequestSchema, input)
      if (!parsed.success) return resultErrorCreate("zitadelGrantAdapterMemoryRevoke", "The project grant was invalid")
      grants.delete(keyCreate(parsed.output))
      return { success: true, data: undefined }
    },
    async grantsRead(organizationId, projectId, subjectId): Promise<Result<readonly ZitadelGrantRequest[]>> {
      return {
        success: true,
        data: [...grants.values()]
          .filter(
            (grant) =>
              grant.organizationId === organizationId && grant.projectId === projectId && grant.subjectId === subjectId,
          )
          .map(copy),
      }
    },
  }
}
