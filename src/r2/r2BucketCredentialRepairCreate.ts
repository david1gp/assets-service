import * as v from "valibot"

import { cloudflareR2BucketCredentialCreate } from "../cloudflare/cloudflareR2BucketCredentialCreate.js"
import { cloudflareR2BucketCredentialRevoke } from "../cloudflare/cloudflareR2BucketCredentialRevoke.js"
import {
  type CloudflareRequestCredentials,
  cloudflareRequestCredentialsSchema,
} from "../cloudflare/cloudflareRequestCredentialsSchema.js"
import { cloudflareSecretRedact } from "../cloudflare/cloudflareSecretRedact.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import {
  type R2BucketCredentialCreateInput,
  r2BucketCredentialCreateInputSchema,
} from "./r2BucketCredentialCreateInputSchema.js"
import type { R2BucketCredentialRepair } from "./r2BucketCredentialRepair.js"
import type { R2BucketCredentialRepairCreateInput } from "./r2BucketCredentialRepairCreateInput.js"
import type { R2BucketCredentialRepairPending } from "./r2BucketCredentialRepairPendingSchema.js"
import {
  type R2BucketCredentialRepairResult,
  r2BucketCredentialRepairResultSchema,
} from "./r2BucketCredentialRepairResultSchema.js"
import type { R2BucketCredential } from "./r2BucketCredentialSchema.js"

const repairCredentialName = "assets-service-repair"

export const r2BucketCredentialRepairCreate = (
  input: R2BucketCredentialRepairCreateInput,
): R2BucketCredentialRepair => {
  let queuedRepair = Promise.resolve()

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
    let pending: ReturnType<
      R2BucketCredentialRepairCreateInput["r2BucketCredentialRepairPendingRepository"]["r2BucketCredentialRepairPendingsRead"]
    >
    try {
      pending = input.r2BucketCredentialRepairPendingRepository.r2BucketCredentialRepairPendingsRead()
    } catch {
      return repairFailure(
        input,
        credentials.output,
        "discover",
        undefined,
        "Pending credential repairs could not be read",
      )
    }
    if (!pending.success) return repairFailure(input, credentials.output, "discover", undefined, pending.errorMessage)
    const repairOwnerId = crypto.randomUUID()
    const repairBuckets = [...new Set([...discoveredBuckets, ...pending.data.map((entry) => entry.bucket)])].sort()
    const claimedBuckets: string[] = []
    for (const bucket of repairBuckets) {
      const claimed = repairClaimRun(input, bucket, repairOwnerId)
      if (!claimed.success) {
        repairBucketsRelease(input, claimedBuckets, repairOwnerId)
        return repairFailure(input, credentials.output, "persist", bucket, claimed.errorMessage)
      }
      if (!claimed.data) {
        repairBucketsRelease(input, claimedBuckets, repairOwnerId)
        return repairFailure(input, credentials.output, "persist", bucket, "Another credential repair is in progress")
      }
      claimedBuckets.push(bucket)
    }

    try {
      let refreshedPending: ReturnType<
        R2BucketCredentialRepairCreateInput["r2BucketCredentialRepairPendingRepository"]["r2BucketCredentialRepairPendingsRead"]
      >
      try {
        refreshedPending = input.r2BucketCredentialRepairPendingRepository.r2BucketCredentialRepairPendingsRead()
      } catch {
        return repairFailure(
          input,
          credentials.output,
          "discover",
          undefined,
          "Pending credential repairs could not be read",
        )
      }
      if (!refreshedPending.success)
        return repairFailure(input, credentials.output, "discover", undefined, refreshedPending.errorMessage)
      const pendingByBucket = new Map(refreshedPending.data.map((entry) => [entry.bucket, entry]))
      const repairedBuckets: string[] = []
      const skippedBuckets: string[] = []
      const verifiedBuckets: string[] = []
      const revokedBuckets: string[] = []

      for (const bucket of pendingByBucket.keys()) {
        if (discoveredBuckets.includes(bucket)) continue
        const renewed = repairClaimRun(input, bucket, repairOwnerId)
        if (!renewed.success) return repairFailure(input, credentials.output, "persist", bucket, renewed.errorMessage)
        if (!renewed.data)
          return repairFailure(input, credentials.output, "persist", bucket, "Another credential repair is in progress")
        const current = credentialReadRun(input, bucket)
        if (!current.success) return repairFailure(input, credentials.output, "discover", bucket, current.errorMessage)
        const recovered = await pendingRepairRun(
          input,
          credentials.output,
          bucket,
          pendingByBucket.get(bucket)!,
          current.data,
        )
        if (!recovered.success) return recovered
        pendingByBucket.delete(bucket)
      }

      for (const bucket of discoveredBuckets) {
        const renewed = repairClaimRun(input, bucket, repairOwnerId)
        if (!renewed.success) return repairFailure(input, credentials.output, "persist", bucket, renewed.errorMessage)
        if (!renewed.data)
          return repairFailure(input, credentials.output, "persist", bucket, "Another credential repair is in progress")
        const current = credentialReadRun(input, bucket)
        if (!current.success) return repairFailure(input, credentials.output, "discover", bucket, current.errorMessage)
        const pendingRepair = pendingByBucket.get(bucket)
        if (current.data === null) {
          if (pendingRepair !== undefined) {
            const recovered = await pendingRepairRun(input, credentials.output, bucket, pendingRepair, null)
            if (!recovered.success) return recovered
            pendingByBucket.delete(bucket)
          }
          return repairFailure(input, credentials.output, "discover", bucket, "No persisted credential exists")
        }
        if (pendingRepair !== undefined) {
          const recovered = await pendingRepairRun(input, credentials.output, bucket, pendingRepair, current.data)
          if (!recovered.success) return recovered
          pendingByBucket.delete(bucket)
          if (recovered.data.replacementReachable) {
            skippedBuckets.push(bucket)
            verifiedBuckets.push(bucket)
            if (recovered.data.obsoleteRevoked) revokedBuckets.push(bucket)
            repairLogWrite(input, { event: "skip", operation: op, phase: "probe", bucket })
            continue
          }
          const refreshed = credentialReadRun(input, bucket)
          if (!refreshed.success)
            return repairFailure(input, credentials.output, "discover", bucket, refreshed.errorMessage)
          if (refreshed.data === null)
            return repairFailure(input, credentials.output, "discover", bucket, "No persisted credential exists")
          current.data = refreshed.data
        }

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
        if (replacement.data.bucket !== bucket || replacement.data.revocationId === null) {
          if (replacement.data.revocationId !== null) {
            const revoked = await replacementRevoke(input, credentials.output, bucket, replacement.data.revocationId)
            if (!revoked.success)
              return repairFailure(
                input,
                credentials.output,
                "revoke",
                bucket,
                "The invalid replacement credential could not be revoked",
                current.data,
                replacement.data,
              )
          }
          return repairFailure(
            input,
            credentials.output,
            "cloudflare",
            bucket,
            "The replacement credential was invalid",
            current.data,
            replacement.data,
          )
        }

        const replacementCredential = replacement.data as R2BucketCredentialRepairReplacement
        const pendingCreated = pendingCreate(input, bucket, current.data, replacementCredential.revocationId)
        if (!pendingCreated.success) {
          const revoked = await replacementRevoke(input, credentials.output, bucket, replacementCredential.revocationId)
          if (!revoked.success)
            return repairFailure(
              input,
              credentials.output,
              "revoke",
              bucket,
              "The replacement could not be recorded or revoked",
              current.data,
              replacementCredential,
            )
          return repairFailure(
            input,
            credentials.output,
            "persist",
            bucket,
            pendingCreated.errorMessage,
            current.data,
            replacementCredential,
          )
        }

        repairLogWrite(input, { event: "persist", operation: op, phase: "persist", bucket })
        const persisted = persistCredential(input, replacementCredential)
        if (!persisted.success) {
          return replacementRollbackRun(
            input,
            credentials.output,
            bucket,
            current.data,
            replacementCredential,
            "persist",
            persisted.errorMessage,
          )
        }
        if (!credentialMatches(persisted.data, replacementCredential)) {
          return replacementRollbackRun(
            input,
            credentials.output,
            bucket,
            current.data,
            replacementCredential,
            "persist",
            "The persisted replacement could not be verified",
          )
        }

        repairLogWrite(input, { event: "verify", operation: op, phase: "verify", bucket })
        const replacementProbe = await credentialProbeRun(input, bucket)
        if (!replacementProbe.success || !replacementProbe.data.reachable) {
          return replacementRollbackRun(
            input,
            credentials.output,
            bucket,
            current.data,
            replacementCredential,
            replacementProbe.success ? "verify" : "probe",
            replacementProbe.success ? "The replacement credential was not reachable" : replacementProbe.errorMessage,
          )
        }

        verifiedBuckets.push(bucket)
        repairedBuckets.push(bucket)
        if (current.data.revocationId !== null) {
          const revoked = await replacementRevoke(input, credentials.output, bucket, current.data.revocationId)
          if (!revoked.success) {
            return repairFailure(
              input,
              credentials.output,
              "revoke",
              bucket,
              "The replacement is working but the obsolete credential could not be revoked",
              current.data,
              replacementCredential,
            )
          }
          revokedBuckets.push(bucket)
        }
        const pendingDeleted = pendingDelete(input, bucket)
        if (!pendingDeleted.success)
          return repairFailure(
            input,
            credentials.output,
            "persist",
            bucket,
            pendingDeleted.errorMessage,
            current.data,
            replacementCredential,
          )
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
    } finally {
      repairBucketsRelease(input, claimedBuckets, repairOwnerId)
    }
  }

  return { r2BucketCredentialRepair }
}

type PendingRepairOutcome = {
  replacementReachable: boolean
  obsoleteRevoked: boolean
}

type R2BucketCredentialRepairReplacement = Omit<R2BucketCredentialCreateInput, "revocationId"> & {
  revocationId: string
}

function credentialReadRun(
  input: R2BucketCredentialRepairCreateInput,
  bucket: string,
): ReturnType<R2BucketCredentialRepairCreateInput["r2BucketCredentialRepository"]["r2BucketCredentialRead"]> {
  try {
    return input.r2BucketCredentialRepository.r2BucketCredentialRead(bucket)
  } catch {
    return resultErrorCreate("r2BucketCredentialRepair", "The persisted credential could not be read")
  }
}

function pendingCreate(
  input: R2BucketCredentialRepairCreateInput,
  bucket: string,
  previousCredential: R2BucketCredential,
  replacementRevocationId: string,
) {
  try {
    return input.r2BucketCredentialRepairPendingRepository.r2BucketCredentialRepairPendingCreate({
      bucket,
      previousCredential,
      replacementRevocationId,
    })
  } catch {
    return resultErrorCreate("r2BucketCredentialRepair", "The pending credential repair could not be persisted")
  }
}

function pendingDelete(input: R2BucketCredentialRepairCreateInput, bucket: string) {
  try {
    return input.r2BucketCredentialRepairPendingRepository.r2BucketCredentialRepairPendingDelete(bucket)
  } catch {
    return resultErrorCreate("r2BucketCredentialRepair", "The pending credential repair could not be deleted")
  }
}

async function pendingRepairRun(
  input: R2BucketCredentialRepairCreateInput,
  credentials: CloudflareRequestCredentials,
  bucket: string,
  pending: R2BucketCredentialRepairPending,
  current: R2BucketCredential | null,
): Promise<Result<PendingRepairOutcome>> {
  if (current === null) {
    const revoked = await replacementRevoke(input, credentials, bucket, pending.replacementRevocationId)
    if (!revoked.success)
      return repairFailure(
        input,
        credentials,
        "revoke",
        bucket,
        revoked.errorMessage,
        pending.previousCredential,
        pendingReplacementCreate(pending),
      )
    return repairFailure(
      input,
      credentials,
      "persist",
      bucket,
      "No persisted credential exists; the pending repair was retained",
      pending.previousCredential,
      pendingReplacementCreate(pending),
    )
  }

  if (credentialEquals(current, pending.previousCredential)) {
    const drained = await replacementDrainRun(input, credentials, bucket, pending.replacementRevocationId)
    if (!drained.success)
      return repairFailure(
        input,
        credentials,
        "revoke",
        bucket,
        drained.errorMessage,
        pending.previousCredential,
        pendingReplacementCreate(pending),
      )
    return { success: true, data: { replacementReachable: false, obsoleteRevoked: false } }
  }

  const probe = await credentialProbeRun(input, bucket)
  if (!probe.success)
    return repairFailure(input, credentials, "probe", bucket, probe.errorMessage, pending.previousCredential, current)
  if (probe.data.reachable) {
    const obsoleteRevocationIds = [
      ...(pending.previousCredential.revocationId === null ? [] : [pending.previousCredential.revocationId]),
      ...(current.revocationId === pending.replacementRevocationId ? [] : [pending.replacementRevocationId]),
    ]
    const revoked = await replacementRevocationsRun(input, credentials, bucket, obsoleteRevocationIds)
    if (!revoked.success)
      return repairFailure(
        input,
        credentials,
        "revoke",
        bucket,
        "The obsolete credential could not be revoked",
        pending.previousCredential,
        current,
      )
    const deleted = pendingDelete(input, bucket)
    if (!deleted.success)
      return repairFailure(
        input,
        credentials,
        "persist",
        bucket,
        deleted.errorMessage,
        pending.previousCredential,
        current,
      )
    return {
      success: true,
      data: { replacementReachable: true, obsoleteRevoked: obsoleteRevocationIds.length > 0 },
    }
  }

  return replacementRollbackRun(
    input,
    credentials,
    bucket,
    pending.previousCredential,
    {
      bucket,
      accessKeyId: current.accessKeyId,
      secretAccessKey: current.secretAccessKey,
      revocationId: pending.replacementRevocationId,
    },
    "verify",
    "The pending replacement credential was not reachable",
    current.revocationId === pending.replacementRevocationId || current.revocationId === null
      ? []
      : [current.revocationId],
  )
}

function pendingReplacementCreate(pending: R2BucketCredentialRepairPending): R2BucketCredentialRepairReplacement {
  return {
    bucket: pending.bucket,
    accessKeyId: "pending-replacement",
    secretAccessKey: "pending-replacement",
    revocationId: pending.replacementRevocationId,
  }
}

async function replacementDrainRun(
  input: R2BucketCredentialRepairCreateInput,
  credentials: CloudflareRequestCredentials,
  bucket: string,
  replacementRevocationId: string,
): Promise<Result<boolean>> {
  const revoked = await replacementRevoke(input, credentials, bucket, replacementRevocationId)
  if (!revoked.success) return revoked
  const deleted = pendingDelete(input, bucket)
  if (!deleted.success) return deleted
  return { success: true, data: true }
}

async function replacementRollbackRun(
  input: R2BucketCredentialRepairCreateInput,
  credentials: CloudflareRequestCredentials,
  bucket: string,
  previousCredential: R2BucketCredential,
  replacement: R2BucketCredentialRepairReplacement,
  phase: "probe" | "persist" | "verify" | "rollback",
  message: string,
  additionalRevocationIds: readonly string[] = [],
): Promise<Result<never>> {
  repairLogWrite(input, { event: "persist", operation: "r2BucketCredentialRepair", phase: "rollback", bucket })
  const restored = persistCredential(input, previousCredential)
  const restoredMatches = restored.success && credentialMatches(restored.data, previousCredential)
  if (restoredMatches) {
    const restoredProbe = await credentialProbeRun(input, bucket)
    if (!restoredProbe.success || !restoredProbe.data.reachable) {
      const revoked = await replacementRevocationsRun(input, credentials, bucket, [
        replacement.revocationId,
        ...additionalRevocationIds,
      ])
      if (!revoked.success)
        return repairFailure(
          input,
          credentials,
          "revoke",
          bucket,
          "The replacement was not reachable and could not be revoked",
          previousCredential,
          replacement,
        )
      return repairFailure(
        input,
        credentials,
        "rollback",
        bucket,
        "The replacement was not reachable and the restored credential could not be verified",
        previousCredential,
        replacement,
      )
    }
  }

  const revoked = await replacementRevocationsRun(input, credentials, bucket, [
    replacement.revocationId,
    ...additionalRevocationIds,
  ])
  if (!revoked.success)
    return repairFailure(
      input,
      credentials,
      "revoke",
      bucket,
      restoredMatches
        ? "The replacement was not reachable and could not be revoked"
        : "The replacement could not be restored or revoked",
      previousCredential,
      replacement,
    )
  if (!restoredMatches)
    return repairFailure(
      input,
      credentials,
      "rollback",
      bucket,
      "The replacement could not be restored or revoked",
      previousCredential,
      replacement,
    )
  const deleted = pendingDelete(input, bucket)
  if (!deleted.success)
    return repairFailure(input, credentials, "persist", bucket, deleted.errorMessage, previousCredential, replacement)
  return repairFailure(input, credentials, phase, bucket, message, previousCredential, replacement)
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

async function replacementRevocationsRun(
  input: R2BucketCredentialRepairCreateInput,
  credentials: CloudflareRequestCredentials,
  bucket: string,
  revocationIds: readonly string[],
): Promise<Result<boolean>> {
  for (const revocationId of [...new Set(revocationIds)]) {
    const revoked = await replacementRevoke(input, credentials, bucket, revocationId)
    if (!revoked.success) return revoked
  }
  return { success: true, data: true }
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

function credentialEquals(left: R2BucketCredential, right: R2BucketCredential): boolean {
  return (
    left.bucket === right.bucket &&
    left.accessKeyId === right.accessKeyId &&
    left.secretAccessKey === right.secretAccessKey &&
    left.revocationId === right.revocationId &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
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
    credentials.accountId,
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

function repairClaimRun(input: R2BucketCredentialRepairCreateInput, bucket: string, ownerId: string): Result<boolean> {
  try {
    return input.r2BucketCredentialRepairPendingRepository.r2BucketCredentialRepairClaim({ bucket, ownerId })
  } catch {
    return resultErrorCreate("r2BucketCredentialRepair", "The R2 bucket credential repair could not be claimed")
  }
}

function repairBucketsRelease(
  input: R2BucketCredentialRepairCreateInput,
  buckets: readonly string[],
  ownerId: string,
): void {
  for (const bucket of buckets) {
    try {
      const released = input.r2BucketCredentialRepairPendingRepository.r2BucketCredentialRepairRelease({
        bucket,
        ownerId,
      })
      if (!released.success)
        repairLogWrite(input, {
          event: "error",
          operation: "r2BucketCredentialRepair",
          phase: "persist",
          bucket,
          error: released.errorMessage,
        })
    } catch {
      repairLogWrite(input, {
        event: "error",
        operation: "r2BucketCredentialRepair",
        phase: "persist",
        bucket,
        error: "The R2 bucket credential repair could not be released",
      })
    }
  }
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
