import * as v from "valibot"

import { cloudflareR2BucketCredentialCreate } from "../cloudflare/cloudflareR2BucketCredentialCreate.js"
import {
  type CloudflareRequestCredentials,
  cloudflareRequestCredentialsSchema,
} from "../cloudflare/cloudflareRequestCredentialsSchema.js"
import { cloudflareSecretRedact } from "../cloudflare/cloudflareSecretRedact.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import type { R2BucketCredentialBackfill } from "./r2BucketCredentialBackfill.js"
import type { R2BucketCredentialBackfillCreateInput } from "./r2BucketCredentialBackfillCreateInput.js"
import {
  type R2BucketCredentialBackfillResult,
  r2BucketCredentialBackfillResultSchema,
} from "./r2BucketCredentialBackfillResultSchema.js"
import {
  type R2BucketCredentialCreateInput,
  r2BucketCredentialCreateInputSchema,
} from "./r2BucketCredentialCreateInputSchema.js"
import type { R2BucketCredential } from "./r2BucketCredentialSchema.js"

export const r2BucketCredentialBackfillCreate = (
  input: R2BucketCredentialBackfillCreateInput,
): R2BucketCredentialBackfill => {
  const pendingCredentials = new Map<string, R2BucketCredentialCreateInput>()
  let queuedBackfill = Promise.resolve()

  const r2BucketCredentialBackfill: R2BucketCredentialBackfill["r2BucketCredentialBackfill"] = (
    credentialsInput,
    dryRun = false,
  ) => {
    const run = queuedBackfill
      .then(() => backfillRun(credentialsInput, dryRun))
      .catch((error): Result<R2BucketCredentialBackfillResult> => {
        const credentials = v.safeParse(cloudflareRequestCredentialsSchema, credentialsInput)
        const message = cloudflareSecretRedact(
          errorMessageRead(error),
          credentials.success ? [credentials.output.apiToken] : [],
        )
        backfillLogWrite(input, {
          event: "error",
          operation: "r2BucketCredentialBackfill",
          phase: "persist",
          dryRun,
          error: message,
        })
        return resultErrorCreate("r2BucketCredentialBackfill", message, undefined, {
          diagnostics: { phase: "persist" },
          retryable: true,
        })
      })
    queuedBackfill = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  const backfillRun = async (
    credentialsInput: CloudflareRequestCredentials,
    dryRun: boolean,
  ): Promise<Result<R2BucketCredentialBackfillResult>> => {
    const op = "r2BucketCredentialBackfill"
    const credentials = v.safeParse(cloudflareRequestCredentialsSchema, credentialsInput)
    if (!credentials.success) return resultErrorCreate(op, "Cloudflare request credentials are invalid")
    backfillLogWrite(input, { event: "phase", operation: op, phase: "discover", dryRun })

    let bindings: Result<readonly StorageBinding[]>
    try {
      bindings = input.liveStorageBindingsRead()
    } catch (error) {
      return backfillFailure(input, credentials.output, "discover", undefined, errorMessageRead(error), dryRun)
    }
    if (!bindings.success)
      return backfillFailure(input, credentials.output, "discover", undefined, bindings.errorMessage, dryRun)
    const discoveredBuckets = [...new Set(bindings.data.map((binding) => binding.bucket))].sort()

    let persisted: Result<readonly R2BucketCredential[]>
    try {
      persisted = input.r2BucketCredentialRepository.r2BucketCredentialsRead()
    } catch (error) {
      return backfillFailure(input, credentials.output, "persist", undefined, errorMessageRead(error), dryRun)
    }
    if (!persisted.success)
      return backfillFailure(input, credentials.output, "persist", undefined, persisted.errorMessage, dryRun)
    const persistedBuckets = new Set(persisted.data.map((credential) => credential.bucket))
    const plannedBuckets: string[] = []
    const createdBuckets: string[] = []
    const skippedBuckets: string[] = []
    for (const bucket of discoveredBuckets) {
      if (persistedBuckets.has(bucket)) {
        pendingCredentials.delete(bucket)
        skippedBuckets.push(bucket)
        backfillLogWrite(input, { event: "skip", operation: op, phase: "discover", bucket, dryRun })
        continue
      }
      if (dryRun) {
        plannedBuckets.push(bucket)
        backfillLogWrite(input, { event: "plan", operation: op, phase: "persist", bucket, dryRun })
        continue
      }

      let credential = pendingCredentials.get(bucket)
      if (credential === undefined) {
        const create = input.r2BucketCredentialCreate ?? cloudflareR2BucketCredentialCreate
        backfillLogWrite(input, { event: "create", operation: op, phase: "cloudflare", bucket, dryRun })
        let created: Result<R2BucketCredentialCreateInput>
        try {
          created = await create({ ...credentials.output, bucket, name: `assets-service-backfill-${bucket}` })
        } catch (error) {
          return backfillFailure(input, credentials.output, "cloudflare", bucket, errorMessageRead(error), dryRun)
        }
        if (!created.success)
          return backfillFailure(input, credentials.output, "cloudflare", bucket, created.errorMessage, dryRun)
        const parsedCredential = v.safeParse(r2BucketCredentialCreateInputSchema, created.data)
        if (!parsedCredential.success)
          return backfillFailure(
            input,
            credentials.output,
            "cloudflare",
            bucket,
            "The created credential was invalid",
            dryRun,
          )
        credential = parsedCredential.output
        if (credential.bucket !== bucket)
          return backfillFailure(
            input,
            credentials.output,
            "cloudflare",
            bucket,
            "The credential targeted another bucket",
            dryRun,
          )
        pendingCredentials.set(bucket, credential)
      }

      let saved: Result<R2BucketCredential>
      try {
        saved = input.r2BucketCredentialRepository.r2BucketCredentialCreate(credential)
      } catch (error) {
        return backfillFailure(
          input,
          credentials.output,
          "persist",
          bucket,
          errorMessageRead(error),
          dryRun,
          credential,
        )
      }
      if (!saved.success)
        return backfillFailure(input, credentials.output, "persist", bucket, saved.errorMessage, dryRun, credential)
      if (!r2BucketCredentialMatches(saved.data, credential))
        return backfillFailure(
          input,
          credentials.output,
          "persist",
          bucket,
          "The persisted credential could not be verified",
          dryRun,
          credential,
        )
      createdBuckets.push(bucket)
      persistedBuckets.add(bucket)
      pendingCredentials.delete(bucket)
    }

    const result: R2BucketCredentialBackfillResult = {
      dryRun,
      discoveredBuckets,
      plannedBuckets,
      createdBuckets,
      skippedBuckets,
    }
    const parsed = v.safeParse(r2BucketCredentialBackfillResultSchema, result)
    if (!parsed.success) return resultErrorCreate(op, "The R2 bucket credential backfill result was invalid")
    backfillLogWrite(input, { event: "phase", operation: op, phase: "complete", dryRun })
    return { success: true, data: parsed.output }
  }

  return { r2BucketCredentialBackfill }
}

function r2BucketCredentialMatches(left: R2BucketCredential, right: R2BucketCredentialCreateInput): boolean {
  return (
    left.bucket === right.bucket &&
    left.accessKeyId === right.accessKeyId &&
    left.secretAccessKey === right.secretAccessKey &&
    left.revocationId === right.revocationId
  )
}

function backfillFailure(
  input: R2BucketCredentialBackfillCreateInput,
  credentials: CloudflareRequestCredentials,
  phase: "discover" | "cloudflare" | "persist",
  bucket: string | undefined,
  message: string,
  dryRun: boolean,
  credential?: R2BucketCredentialCreateInput,
): Result<never> {
  const error = cloudflareSecretRedact(message, [
    credentials.apiToken,
    credential?.accessKeyId,
    credential?.secretAccessKey,
    credential?.revocationId,
  ])
  backfillLogWrite(input, {
    event: "error",
    operation: "r2BucketCredentialBackfill",
    phase,
    ...(bucket === undefined ? {} : { bucket }),
    dryRun,
    error,
  })
  return resultErrorCreate("r2BucketCredentialBackfill", error, undefined, {
    diagnostics: { phase, ...(bucket === undefined ? {} : { bucket }) },
    retryable: true,
  })
}

function errorMessageRead(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function backfillLogWrite(
  input: R2BucketCredentialBackfillCreateInput,
  entry: NonNullable<Parameters<NonNullable<R2BucketCredentialBackfillCreateInput["backfillLogger"]>>[0]>,
): void {
  const logger = input.backfillLogger ?? backfillConsoleLog
  try {
    logger(entry)
  } catch {
    // Logging must not change the retryable result.
  }
}

function backfillConsoleLog(
  entry: NonNullable<Parameters<NonNullable<R2BucketCredentialBackfillCreateInput["backfillLogger"]>>[0]>,
): void {
  const serialized = JSON.stringify(entry)
  if (entry.event === "error") console.error(serialized)
  else console.info(serialized)
}
