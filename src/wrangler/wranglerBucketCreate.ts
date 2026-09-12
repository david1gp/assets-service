import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { WranglerCommandRunner } from "./wranglerCommandRunner.js"
import { wranglerProvisioningRun } from "./wranglerProvisioningRun.js"

export const wranglerBucketCreate = async (
  runner: WranglerCommandRunner,
  input: { bucket: string; profile?: string },
): Promise<Result<{ name: string; created: boolean }>> => {
  if (typeof input.bucket !== "string" || input.bucket.length === 0)
    return resultErrorCreate("wranglerBucketCreate", "Bucket is required")
  const result = await wranglerProvisioningRun(runner, {
    bucket: input.bucket,
    createBucket: true,
    ...(input.profile === undefined ? {} : { profile: input.profile }),
  })
  if (!result.success) return result
  if (result.data.bucket === undefined)
    return { success: false, op: "wranglerBucketCreate", errorMessage: "Wrangler did not return bucket details" }
  return { success: true, data: result.data.bucket }
}
