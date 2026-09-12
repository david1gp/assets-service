import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import { storageBucketDedicatedValidate } from "../storage/storageBucketDedicatedValidate.js"
import type { WranglerCommandRunner } from "./wranglerCommandRunner.js"

export const wranglerBucketDelete = async (
  runner: WranglerCommandRunner,
  input: { bucket: string; projectId: string; bindings: readonly StorageBinding[]; profile?: string },
): Promise<Result<{ name: string; deleted: boolean }>> => {
  const op = "wranglerBucketDelete"
  const proof = storageBucketDedicatedValidate(input)
  if (!proof.success) return proof

  const info = await commandInvoke(runner, ["r2", "bucket", "info", input.bucket, "--json"], input.profile)
  if (!info.success) return info
  if (info.data.exitCode !== 0) {
    if (bucketMissing(info.data)) return { success: true, data: { name: input.bucket, deleted: false } }
    return resultErrorCreate(op, "Wrangler bucket lookup failed")
  }

  const deleted = await commandInvoke(runner, ["r2", "bucket", "delete", input.bucket, "--force"], input.profile)
  if (!deleted.success) return deleted
  if (deleted.data.exitCode !== 0) {
    if (bucketMissing(deleted.data)) return { success: true, data: { name: input.bucket, deleted: false } }
    return resultErrorCreate(op, "Wrangler bucket deletion failed")
  }
  const remaining = await commandInvoke(runner, ["r2", "bucket", "info", input.bucket, "--json"], input.profile)
  if (!remaining.success) return remaining
  if (remaining.data.exitCode === 0) return resultErrorCreate(op, "Wrangler bucket deletion could not be verified")
  if (!bucketMissing(remaining.data)) return resultErrorCreate(op, "Wrangler bucket deletion could not be verified")
  return { success: true, data: { name: input.bucket, deleted: true } }
}

async function commandInvoke(
  runner: WranglerCommandRunner,
  args: readonly string[],
  profile: string | undefined,
): Promise<Result<{ exitCode: number; stdout: string; stderr: string }>> {
  try {
    const result = await runner({ args: profile === undefined ? args : [...args, "--profile", profile] })
    if (!result.success) return result
    return result
  } catch (error) {
    return resultErrorCreate("wranglerBucketDelete", "Wrangler command failed", error)
  }
}

function bucketMissing(output: { stdout: string; stderr: string }): boolean {
  return /(?:bucket|r2 bucket)[\s\S]{0,100}(?:not found|does not exist|no such)|code\s*[:=]\s*10006|"code"\s*:\s*10006/i.test(
    `${output.stderr}\n${output.stdout}`,
  )
}
