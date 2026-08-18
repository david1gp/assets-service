import type { Result } from "../../schemas/resultSchema.js"
import type { ZitadelProjectProvisioningRequest } from "./zitadelProjectProvisioningRequestSchema.js"
import type { ZitadelProjectProvisioningResult } from "./zitadelProjectProvisioningResultSchema.js"

export type ZitadelProvisioningAdapter = {
  projectProvision: (input: ZitadelProjectProvisioningRequest) => Promise<Result<ZitadelProjectProvisioningResult>>
}
