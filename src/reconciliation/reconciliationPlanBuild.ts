import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ReconciliationPlan, ReconciliationPlanItem } from "./reconciliationPlanSchema.js"
import { reconciliationPlanSchema } from "./reconciliationPlanSchema.js"

export type ReconciliationObject = {
  bucket: string
  objectKey: string
  byteSize?: number
  sha256?: string
  lastModified?: string
}

export type ReconciliationOwnership = {
  recordId: string
  bucket: string
  objectKey: string
  kind: "staging" | "private" | "public"
  verifiedOwnership: boolean
  eligibleForDeletion: boolean
  reason: string
  lastModified?: string
  expectedByteSize?: number
  expectedSha256?: string
}

export type ReconciliationStalledRecord = {
  recordId: string
  reason: string
}

export const reconciliationPlanBuild = (input: {
  objects: readonly ReconciliationObject[]
  ownership: readonly ReconciliationOwnership[]
  stalledRecords?: readonly ReconciliationStalledRecord[]
  now?: Date | string
  minimumAgeMs?: number
}): Result<ReconciliationPlan> => {
  const op = "reconciliationPlanBuild"
  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now())
  if (Number.isNaN(now.getTime())) return resultErrorCreate(op, "Reconciliation plan time is invalid")
  const minimumAgeMs = input.minimumAgeMs ?? 24 * 60 * 60 * 1000
  if (!Number.isInteger(minimumAgeMs) || minimumAgeMs < 0)
    return resultErrorCreate(op, "Reconciliation minimum age must be a non-negative integer")

  const ownershipByObject = new Map<string, ReconciliationOwnership[]>()
  for (const owner of input.ownership) {
    const key = objectIdentityCreate(owner.bucket, owner.objectKey)
    const records = ownershipByObject.get(key) ?? []
    records.push(owner)
    ownershipByObject.set(key, records)
  }

  const items: ReconciliationPlanItem[] = []
  const seenObjects = new Set<string>()
  for (const object of [...input.objects].toSorted(objectSort)) {
    const objectKey = objectIdentityCreate(object.bucket, object.objectKey)
    if (seenObjects.has(objectKey)) {
      items.push(planItemCreate(object, "retain", "duplicate_storage_listing", null, false, "private"))
      continue
    }
    seenObjects.add(objectKey)
    const owners = ownershipByObject.get(objectKey) ?? []
    if (owners.length === 0) {
      items.push(
        planItemCreate(object, "retain", "unknown_object_no_verified_owner", null, false, kindRead(object.objectKey)),
      )
      continue
    }
    if (owners.length !== 1) {
      items.push(
        planItemCreate(object, "retain", "ambiguous_verified_ownership", null, false, owners[0]?.kind ?? "private"),
      )
      continue
    }
    const owner = owners[0]
    if (owner === undefined || !owner.verifiedOwnership) {
      items.push(
        planItemCreate(
          object,
          "retain",
          "ownership_record_is_not_verified",
          owner?.recordId ?? null,
          false,
          owner?.kind ?? "private",
        ),
      )
      continue
    }
    const age = object.lastModified === undefined ? null : now.getTime() - new Date(object.lastModified).getTime()
    if (age === null || Number.isNaN(age) || age < minimumAgeMs) {
      items.push(
        planItemCreate(object, "retain", "object_is_younger_than_cleanup_window", owner.recordId, true, owner.kind),
      )
      continue
    }
    items.push(
      planItemCreate(
        object,
        owner.eligibleForDeletion ? "delete" : "retain",
        owner.reason,
        owner.recordId,
        true,
        owner.kind,
      ),
    )
  }

  for (const owner of input.ownership) {
    const key = objectIdentityCreate(owner.bucket, owner.objectKey)
    if (seenObjects.has(key)) continue
    items.push({
      id: `record-${owner.recordId}`,
      bucket: owner.bucket,
      objectKey: owner.objectKey,
      kind: owner.kind,
      action: "retain",
      reason: "owned_record_missing_object",
      ownershipRecordId: owner.recordId,
      ownershipVerified: owner.verifiedOwnership,
      lastModified: owner.lastModified ?? null,
    })
  }

  for (const stalled of [...(input.stalledRecords ?? [])].toSorted((left, right) =>
    left.recordId.localeCompare(right.recordId),
  )) {
    items.push({
      id: `stalled-${stalled.recordId}`,
      bucket: null,
      objectKey: stalled.recordId,
      kind: "stalled",
      action: "recover",
      reason: stalled.reason,
      ownershipRecordId: null,
      ownershipVerified: false,
      lastModified: null,
    })
  }

  const generatedAt = now.toISOString()
  const identity = new Bun.CryptoHasher("sha256").update(JSON.stringify(items)).digest("hex")
  const parsed = v.safeParse(reconciliationPlanSchema, {
    schema: "assets.reconciliation-plan.v1",
    id: `reconciliation-${identity.slice(0, 48)}`,
    generatedAt,
    dryRun: true,
    requiresVerifiedBackup: true,
    items,
  })
  if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), input)
  return { success: true, data: parsed.output }
}

function objectIdentityCreate(bucket: string, objectKey: string): string {
  return `${bucket}\u0000${objectKey}`
}

function objectSort(left: ReconciliationObject, right: ReconciliationObject): number {
  const leftIdentity = objectIdentityCreate(left.bucket, left.objectKey)
  const rightIdentity = objectIdentityCreate(right.bucket, right.objectKey)
  return leftIdentity.localeCompare(rightIdentity)
}

function planItemCreate(
  object: ReconciliationObject,
  action: ReconciliationPlanItem["action"],
  reason: string,
  ownershipRecordId: string | null,
  ownershipVerified: boolean,
  kind: ReconciliationPlanItem["kind"],
): ReconciliationPlanItem {
  const identity = new Bun.CryptoHasher("sha256").update(`${object.bucket}\u0000${object.objectKey}`).digest("hex")
  return {
    id: `object-${identity.slice(0, 48)}`,
    bucket: object.bucket,
    objectKey: object.objectKey,
    kind,
    action,
    reason,
    ownershipRecordId,
    ownershipVerified,
    lastModified: object.lastModified ?? null,
  }
}

function kindRead(objectKey: string): ReconciliationPlanItem["kind"] {
  if (objectKey.includes("/staging/")) return "staging"
  if (objectKey.startsWith("public/") || objectKey.includes("/public/")) return "public"
  return "private"
}
