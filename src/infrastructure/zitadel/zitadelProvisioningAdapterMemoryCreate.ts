import * as v from "valibot"

import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import {
  type ZitadelProjectProvisioningRequest,
  zitadelProjectProvisioningRequestSchema,
} from "./zitadelProjectProvisioningRequestSchema.js"
import {
  type ZitadelProjectProvisioningResult,
  zitadelProjectProvisioningResultSchema,
} from "./zitadelProjectProvisioningResultSchema.js"
import type { ZitadelProvisioningAdapter } from "./zitadelProvisioningAdapter.js"
import type { ZitadelGrantAdapter } from "./zitadelGrantAdapter.js"

type ZitadelProvisioningAdapterMemoryOptions = {
  applicationIdCreate?: (input: ZitadelProjectProvisioningRequest) => string
  grantAdapter?: ZitadelGrantAdapter
}

export const zitadelProvisioningAdapterMemoryCreate = (
  options: ZitadelProvisioningAdapterMemoryOptions = {},
): ZitadelProvisioningAdapter => {
  const applicationIdCreate = options.applicationIdCreate ?? ((input) => `application:${input.projectId}`)
  const provisioned = new Map<string, ZitadelProjectProvisioningResult>()

  return {
    async projectProvision(input): Promise<Result<ZitadelProjectProvisioningResult>> {
      const parsed = v.safeParse(zitadelProjectProvisioningRequestSchema, input)
      if (!parsed.success)
        return resultErrorCreate("zitadelProvisioningAdapterMemoryCreate", "The provisioning request was invalid")
      const result = v.safeParse(zitadelProjectProvisioningResultSchema, {
        organizationId: parsed.output.organizationId,
        projectId: parsed.output.projectId,
        applicationId: applicationIdCreate(parsed.output),
        roleKeys: ["assets.uploader", "assets.admin"],
      })
      if (!result.success)
        return resultErrorCreate("zitadelProvisioningAdapterMemoryCreate", "The provisioning result was invalid")
      if (options.grantAdapter && parsed.output.grantRequests) {
        for (const grant of parsed.output.grantRequests) {
          if (grant.organizationId !== parsed.output.organizationId || grant.projectId !== parsed.output.projectId)
            return resultErrorCreate("zitadelProvisioningAdapterMemoryCreate", "A grant was bound to another project")
          const saved = await options.grantAdapter.grant(grant)
          if (!saved.success) return saved
        }
      }
      provisioned.set(`${parsed.output.organizationId}/${parsed.output.projectId}`, result.output)
      return { success: true, data: result.output }
    },
  }
}
