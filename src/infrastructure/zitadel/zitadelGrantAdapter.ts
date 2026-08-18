import type { Result } from "../../schemas/resultSchema.js"
import type { ZitadelGrantRequest } from "./zitadelGrantRequestSchema.js"

export type ZitadelGrantAdapter = {
  grant: (input: ZitadelGrantRequest) => Promise<Result<undefined>>
  revoke: (input: ZitadelGrantRequest) => Promise<Result<undefined>>
  grantsRead: (
    organizationId: string,
    projectId: string,
    subjectId: string,
  ) => Promise<Result<readonly ZitadelGrantRequest[]>>
}
