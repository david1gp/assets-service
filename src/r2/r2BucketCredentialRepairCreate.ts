import * as v from "valibot"

import { cloudflareR2BucketCredentialCreate } from "../cloudflare/cloudflareR2BucketCredentialCreate.js"
import {
  type CloudflareRequestCredentials,
  cloudflareRequestCredentialsSchema,
} from "../cloudflare/cloudflareRequestCredentialsSchema.js"
import { cloudflareR2BucketCredentialRevoke } from "../cloudflare/cloudflareR2BucketCredentialRevoke.js"
import { cloudflareSecretRedact } from "../cloudflare/cloudflareSecretRedact.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { R2BucketCredential } from "./r2BucketCredentialSchema.js"
import type { R2BucketCredentialRepair } from "./r2BucketCredentialRepair.js"
import type { R2BucketCredentialRepairCreateInput } from "./r2BucketCredentialRepairCreateInput.js"
import {
  type R2BucketCredentialRepairResult,
  r2BucketCredentialRepairResultSchema,
} from "./r2BucketCredentialRepairResultSchema.js"
import {
  type R2BucketCredentialCreateInput,
  r2BucketCredentialCreateInputSchema,
} from "./r2BucketCredentialCreateInputSchema.js"

const repairCredentialName = "assets-service-repair"

export const r2BucketCredentialRepairCreate = (
  input: R2BucketCredentialRepairCreateInput,
): R2BucketCredentialRepair => {
  let queuedRepair = Promise.resolve()
  const pendingRevocations = new Map<string, string>()

  const r2BucketCredentialRepair: R2BucketCredentialRepair["r2BucketCredentialRepair"] = (credentialsInput) => {
    const run = queuedRepair
      .then(() => repairRun(credentialsInput))
      .catch(() => {
        const credentials = v.safeParse(cloudflareRequestCredentialsSchema, credentialsInput)
        if (!credentials.success)
          return resultErrorCreate("r2BucketCredentialRepair", "Cloudflare request credentials are invalid")
        return repairFailure(input, credentials.output, "discover", undefined, "The R2 bucket credential repair failed")
      })
    queuedRepair = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  const repairRun: R2BucketCredentialRepair["r2BucketCredentialRepair"] = async (credentialsInput) => {
    const op = "r2BucketCredentialRepair"
    const credentials = v.safeParse(cloudflareRequestCredentialsSchema, credentialsInput)
    if (!credentials.success) return resultErrorCreate(op, "Cloudflare request credentials are invalid")

    repairLogWrite(input, { event: "phase", operation: op, phase: "discover" })
    let bindings: ReturnType<R2BucketCredentialRepairCreateInput["liveStorageBindingsRead"]>
    try {
      bindings = input.liveStorageBindingsRead()
    } catch {
      return repairFailure(input, credentials.output, "discover", undefined, "Live storage bindings could not be read")
    }
    if (!bindings.success) return repairFailure(input, credentials.output, "discover", undefined, bindings.errorMessage)
    const discoveredBuckets = [...new Set(bindings.data.map((binding) => binding.bucket))].sort()
    const repairedBuckets: string[] = []
    const skippedBuckets: string[] = []
    const verifiedBuckets: string[] = []
    const revokedBuckets: string[] = []

    for (const bucket of discoveredBuckets) {
      const pendingRevocation = pendingRevocations.get(bucket)
      if (pendingRevocation !== undefined) {
        const revoked = await replacementRevoke(input, credentials.output, bucket, pendingRevocation)
        if (!revoked.success)
          return repairFailure(
            input,
            credentials.output,
            "revoke",
            bucket,
            "The obsolete credential could not be revoked",
          )
        pendingRevocations.delete(bucket)
      }
      let current: ReturnType<
        R2BucketCredentialRepairCreateInput["r2BucketCredentialRepository"]["r2BucketCredentialRead"]
      >
      try {
        current = input.r2BucketCredentialRepository.r2BucketCredentialRead(bucket)
      } catch {
        return repairFailure(
          input,
          credentials.output,
          "discover",
          bucket,
          "The persisted credential could not be read",
        )
      }
      if (!current.success) return repairFailure(input, credentials.output, "discover", bucket, current.errorMessage)
      if (current.data === null)
        return repairFailure(input, credentials.output, "discover", bucket, "No persisted credential exists")

      const existingProbe = await credentialProbeRun(input, bucket)
      if (!existingProbe.success)
        return repairFailure(input, credentials.output, "probe", bucket, existingProbe.errorMessage, current.data)
      if (existingProbe.data.reachable) {
        skippedBuckets.push(bucket)
        verifiedBuckets.push(bucket)
        repairLogWrite(input, { event: "skip", operation: op, phase: "probe", bucket })
        continue
      }

      repairLogWrite(input, { event: "create", operation: op, phase: "cloudflare", bucket })
      const replacement = await replacementCreate(input, credentials.output, bucket)
      if (!replacement.success)
        return repairFailure(input, credentials.output, "cloudflare", bucket, replacement.errorMessage, current.data)
      if (replacement.data.bucket !== bucket || replacement.data.revocationId === null)
        return repairFailure(
          input,
          credentials.output,
          "cloudflare",
          bucket,
          "The replacement credential was invalid",
          current.data,
          replacement.data,
        )

      repairLogWrite(input, { event: "persist", operation: op, phase: "persist", bucket })
      const persisted = persistCredential(input, replacement.data)
      if (!persisted.success) {
        const revoked = await replacementRevoke(input, credentials.output, bucket, replacement.data.revocationId)
        if (!revoked.success)
          return repairFailure(
            input,
            credentials.output,
            "revoke",
            bucket,
            "The replacement could not be persisted or revoked",
            current.data,
            replacement.data,
          )
        return repairFailure(
          input,
          credentials.output,
          "persist",
          bucket,
          persisted.errorMessage,
          current.data,
          replacement.data,
        )
      }
      if (!credentialMatches(persisted.data, replacement.data)) {
        const revoked = await replacementRevoke(input, credentials.output, bucket, replacement.data.revocationId)
        if (!revoked.success)
          return repairFailure(
            input,
            credentials.output,
            "revoke",
            bucket,
            "The persisted replacement did not match and could not be revoked",
            current.data,
            replacement.data,
          )
        return repairFailure(
          input,
          credentials.output,
          "persist",
          bucket,
          "The persisted replacement could not be verified",
          current.data,
          replacement.data,
        )
      }

      repairLogWrite(input, { event: "verify", operation: op, phase: "verify", bucket })
      const replacementProbe = await credentialProbeRun(input, bucket)
      if (!replacementProbe.success || !replacementProbe.data.reachable) {
        repairLogWrite(input, { event: "persist", operation: op, phase: "rollback", bucket })
        const restored = persistCredential(input, current.data)
        if (!restored.success || !credentialMatches(restored.data, current.data))
          return repairFailure(
            input,
            credentials.output,
            "rollback",
            bucket,
            "The replacement was not reachable and the previous credential could not be restored",
            current.data,
            replacement.data,
          )
        const restoredProbe = await credentialProbeRun(input, bucket)
        if (!restoredProbe.success || !restoredProbe.data.reachable)
          return repairFailure(
            input,
            credentials.output,
            "rollback",
            bucket,
            "The replacement was not reachable and the restored credential could not be verified",
            current.data,
            replacement.data,
          )
        const revoked = await replacementRevoke(input, credentials.output, bucket, replacement.data.revocationId)
        if (!revoked.success)
          return repairFailure(
            input,
            credentials.output,
            "revoke",
            bucket,
            "The replacement was not reachable and could not be revoked",
            current.data,
            replacement.data,
          )
        return repairFailure(
          input,
          credentials.output,
          "verify",
          bucket,
          "The replacement credential was not reachable",
          current.data,
          replacement.data,
        )
      }

      verifiedBuckets.push(bucket)
      repairedBuckets.push(bucket)
      if (current.data.revocationId !== null) {
        const revoked = await replacementRevoke(input, credentials.output, bucket, current.data.revocationId)
        if (!revoked.success) {
          pendingRevocations.set(bucket, current.data.revocationId)
          return repairFailure(
            input,
            credentials.output,
            "revoke",
            bucket,
            "The replacement is working but the obsolete credential could not be revoked",
            current.data,
            replacement.data,
          )
        }
        revokedBuckets.push(bucket)
      }
    }

    const result: R2BucketCredentialRepairResult = {
      discoveredBuckets,
      repairedBuckets,
      skippedBuckets,
      verifiedBuckets,
      revokedBuckets,
    }
    const parsed = v.safeParse(r2BucketCredentialRepairResultSchema, result)
    if (!parsed.success) return resultErrorCreate(op, "The R2 bucket credential repair result was invalid")
    repairLogWrite(input, { event: "phase", operation: op, phase: "complete" })
    return { success: true, data: parsed.output }
  }

  return { r2BucketCredentialRepair }
}

async function replacementCreate(
  input: R2BucketCredentialRepairCreateInput,
  credentials: CloudflareRequestCredentials,
  bucket: string,
): Promise<Result<R2BucketCredentialCreateInput>> {
  const create = input.r2BucketCredentialCreate ?? cloudflareR2BucketCredentialCreate
  try {
    const created = await create({ ...credentials, bucket, name: repairCredentialName })
    if (!created.success) return created
    const parsed = v.safeParse(r2BucketCredentialCreateInputSchema, created.data)
    if (!parsed.success) return resultErrorCreate("r2BucketCredentialRepair", "The replacement credential was invalid")
    return { success: true, data: parsed.output }
  } catch {
    return resultErrorCreate("r2BucketCredentialRepair", "The replacement credential could not be created")
  }
}

async function replacementRevoke(
  input: R2BucketCredentialRepairCreateInput,
  credentials: CloudflareRequestCredentials,
  bucket: string,
  revocationId: string,
): Promise<Result<boolean>> {
  const revoke = input.r2BucketCredentialRevoke ?? cloudflareR2BucketCredentialRevoke
  repairLogWrite(input, { event: "revoke", operation: "r2BucketCredentialRepair", phase: "revoke", bucket })
  try {
    return await revoke({ ...credentials, revocationId })
  } catch {
    return resultErrorCreate("r2BucketCredentialRepair", "The credential could not be revoked")
  }
}

function persistCredential(
  input: R2BucketCredentialRepairCreateInput,
  credential: R2BucketCredentialCreateInput,
): Result<R2BucketCredential> {
  try {
    return input.r2BucketCredentialRepository.r2BucketCredentialCreate(credential)
  } catch {
    return resultErrorCreate("r2BucketCredentialRepair", "The credential could not be persisted")
  }
}

async function credentialProbeRun(
  input: R2BucketCredentialRepairCreateInput,
  bucket: string,
): Promise<Result<{ reachable: boolean }>> {
  try {
    const probed = await input.credentialProbe(bucket)
    if (!probed.success) {
      const status = credentialProbeStatusRead(probed.diagnostics)
      if (status === 401 || status === 403) return { success: true, data: { reachable: false } }
      return probed
    }
    return { success: true, data: { reachable: probed.data.reachable } }
  } catch {
    return resultErrorCreate("r2BucketCredentialRepair", "The persisted credential could not be verified")
  }
}

function credentialProbeStatusRead(diagnostics: unknown): number | undefined {
  if (diagnostics === null || typeof diagnostics !== "object") return undefined
  if (!("status" in diagnostics) || typeof diagnostics.status !== "number") return undefined
  return diagnostics.status
}

function credentialMatches(left: R2BucketCredential, right: R2BucketCredentialCreateInput): boolean {
  return (
    left.bucket === right.bucket &&
    left.accessKeyId === right.accessKeyId &&
    left.secretAccessKey === right.secretAccessKey &&
    left.revocationId === right.revocationId
  )
}

function repairFailure(
  input: R2BucketCredentialRepairCreateInput,
  credentials: CloudflareRequestCredentials,
  phase: "discover" | "probe" | "cloudflare" | "persist" | "verify" | "rollback" | "revoke",
  bucket: string | undefined,
  message: string,
  current?: R2BucketCredential,
  replacement?: R2BucketCredentialCreateInput,
): Result<never> {
  const error = cloudflareSecretRedact(message, [
    credentials.apiToken,
    current?.accessKeyId,
    current?.secretAccessKey,
    current?.revocationId,
    replacement?.accessKeyId,
    replacement?.secretAccessKey,
    replacement?.revocationId,
  ])
  repairLogWrite(input, {
    event: "error",
    operation: "r2BucketCredentialRepair",
    phase,
    ...(bucket === undefined ? {} : { bucket }),
    error,
  })
  return resultErrorCreate("r2BucketCredentialRepair", error, undefined, {
    diagnostics: { phase, ...(bucket === undefined ? {} : { bucket }) },
    retryable: true,
  })
}

function repairLogWrite(
  input: R2BucketCredentialRepairCreateInput,
  entry: NonNullable<Parameters<NonNullable<R2BucketCredentialRepairCreateInput["repairLogger"]>>[0]>,
): void {
  try {
    input.repairLogger?.(entry)
  } catch {
    // Logging must not change the repair result.
  }
}
