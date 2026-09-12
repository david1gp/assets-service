import { and, asc, eq, lte } from "drizzle-orm"
import * as v from "valibot"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { r2BucketCredentialRepairLockTable } from "../infrastructure/db/schema/r2BucketCredentialRepairLockTable.js"
import { r2BucketCredentialRepairPendingTable } from "../infrastructure/db/schema/r2BucketCredentialRepairPendingTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { r2BucketCredentialDecrypt } from "./r2BucketCredentialDecrypt.js"
import { r2BucketCredentialEncrypt } from "./r2BucketCredentialEncrypt.js"
import type { R2BucketCredentialRepairPendingRepository } from "./r2BucketCredentialRepairPendingRepository.js"
import {
  type R2BucketCredentialRepairPending,
  r2BucketCredentialRepairPendingSchema,
} from "./r2BucketCredentialRepairPendingSchema.js"

type PendingCreate = R2BucketCredentialRepairPendingRepository["r2BucketCredentialRepairPendingCreate"]
type PendingRead = R2BucketCredentialRepairPendingRepository["r2BucketCredentialRepairPendingRead"]
type PendingsRead = R2BucketCredentialRepairPendingRepository["r2BucketCredentialRepairPendingsRead"]
type PendingDelete = R2BucketCredentialRepairPendingRepository["r2BucketCredentialRepairPendingDelete"]
type RepairClaim = R2BucketCredentialRepairPendingRepository["r2BucketCredentialRepairClaim"]
type RepairRelease = R2BucketCredentialRepairPendingRepository["r2BucketCredentialRepairRelease"]

export const r2BucketCredentialRepairPendingRepositoryCreate = (
  db: AssetDatabase,
  encryptionKey: string,
): R2BucketCredentialRepairPendingRepository => {
  const pendingRead = (
    record: typeof r2BucketCredentialRepairPendingTable.$inferSelect,
    op: string,
  ): Result<R2BucketCredentialRepairPending> => {
    const accessKeyId = r2BucketCredentialDecrypt(record.previousAccessKeyIdCiphertext, encryptionKey)
    if (!accessKeyId.success) return resultErrorCreate(op, "The pending R2 credential repair was invalid")
    const secretAccessKey = r2BucketCredentialDecrypt(record.previousSecretAccessKeyCiphertext, encryptionKey)
    if (!secretAccessKey.success) return resultErrorCreate(op, "The pending R2 credential repair was invalid")
    const parsed = v.safeParse(r2BucketCredentialRepairPendingSchema, {
      bucket: record.bucket,
      previousCredential: {
        bucket: record.bucket,
        accessKeyId: accessKeyId.data,
        secretAccessKey: secretAccessKey.data,
        revocationId: record.previousRevocationId,
        createdAt: record.previousCreatedAt,
        updatedAt: record.previousUpdatedAt,
      },
      replacementRevocationId: record.replacementRevocationId,
    })
    if (!parsed.success) return resultErrorCreate(op, "The pending R2 credential repair was invalid")
    return { success: true, data: parsed.output }
  }

  const r2BucketCredentialRepairPendingCreate: PendingCreate = (input, transactionInput) => {
    const op = "r2BucketCredentialRepairPendingCreate"
    const parsed = v.safeParse(r2BucketCredentialRepairPendingSchema, input)
    if (!parsed.success) return resultErrorCreate(op, "The pending R2 credential repair was invalid")
    if (parsed.output.bucket !== parsed.output.previousCredential.bucket)
      return resultErrorCreate(op, "The pending R2 credential repair bucket did not match")
    const accessKeyId = r2BucketCredentialEncrypt(parsed.output.previousCredential.accessKeyId, encryptionKey)
    if (!accessKeyId.success) return resultErrorCreate(op, "The pending R2 credential repair could not be persisted")
    const secretAccessKey = r2BucketCredentialEncrypt(parsed.output.previousCredential.secretAccessKey, encryptionKey)
    if (!secretAccessKey.success)
      return resultErrorCreate(op, "The pending R2 credential repair could not be persisted")
    try {
      const transaction = transactionInput ?? db
      transaction
        .insert(r2BucketCredentialRepairPendingTable)
        .values({
          bucket: parsed.output.bucket,
          previousAccessKeyIdCiphertext: accessKeyId.data,
          previousSecretAccessKeyCiphertext: secretAccessKey.data,
          previousRevocationId: parsed.output.previousCredential.revocationId,
          previousCreatedAt: parsed.output.previousCredential.createdAt,
          previousUpdatedAt: parsed.output.previousCredential.updatedAt,
          replacementRevocationId: parsed.output.replacementRevocationId,
        })
        .onConflictDoUpdate({
          target: r2BucketCredentialRepairPendingTable.bucket,
          set: {
            previousAccessKeyIdCiphertext: accessKeyId.data,
            previousSecretAccessKeyCiphertext: secretAccessKey.data,
            previousRevocationId: parsed.output.previousCredential.revocationId,
            previousCreatedAt: parsed.output.previousCredential.createdAt,
            previousUpdatedAt: parsed.output.previousCredential.updatedAt,
            replacementRevocationId: parsed.output.replacementRevocationId,
          },
        })
        .run()
      const record = transaction
        .select()
        .from(r2BucketCredentialRepairPendingTable)
        .where(eq(r2BucketCredentialRepairPendingTable.bucket, parsed.output.bucket))
        .get()
      if (record === undefined) return resultErrorCreate(op, "The pending R2 credential repair could not be persisted")
      return pendingRead(record, op)
    } catch (error) {
      return resultErrorCreate(op, "The pending R2 credential repair could not be persisted", error)
    }
  }

  const r2BucketCredentialRepairPendingRead: PendingRead = (bucket, transactionInput) => {
    const op = "r2BucketCredentialRepairPendingRead"
    try {
      const record = (transactionInput ?? db)
        .select()
        .from(r2BucketCredentialRepairPendingTable)
        .where(eq(r2BucketCredentialRepairPendingTable.bucket, bucket))
        .get()
      if (record === undefined) return { success: true, data: null }
      return pendingRead(record, op)
    } catch (error) {
      return resultErrorCreate(op, "The pending R2 credential repair could not be read", error)
    }
  }

  const r2BucketCredentialRepairPendingsRead: PendingsRead = (transactionInput) => {
    const op = "r2BucketCredentialRepairPendingsRead"
    try {
      const records = (transactionInput ?? db)
        .select()
        .from(r2BucketCredentialRepairPendingTable)
        .orderBy(asc(r2BucketCredentialRepairPendingTable.bucket))
        .all()
      const pending: R2BucketCredentialRepairPending[] = []
      for (const record of records) {
        const parsed = pendingRead(record, op)
        if (!parsed.success) return parsed
        pending.push(parsed.data)
      }
      return { success: true, data: pending }
    } catch (error) {
      return resultErrorCreate(op, "The pending R2 credential repairs could not be read", error)
    }
  }

  const r2BucketCredentialRepairPendingDelete: PendingDelete = (bucket, transactionInput) => {
    const op = "r2BucketCredentialRepairPendingDelete"
    try {
      const transaction = transactionInput ?? db
      const existing = transaction
        .select({ bucket: r2BucketCredentialRepairPendingTable.bucket })
        .from(r2BucketCredentialRepairPendingTable)
        .where(eq(r2BucketCredentialRepairPendingTable.bucket, bucket))
        .get()
      if (existing === undefined) return { success: true, data: false }
      transaction
        .delete(r2BucketCredentialRepairPendingTable)
        .where(eq(r2BucketCredentialRepairPendingTable.bucket, bucket))
        .run()
      return { success: true, data: true }
    } catch (error) {
      return resultErrorCreate(op, "The pending R2 credential repair could not be deleted", error)
    }
  }

  const r2BucketCredentialRepairClaim: RepairClaim = (
    { bucket, ownerId, now = Date.now(), leaseMilliseconds = 300_000 },
    transactionInput,
  ) => {
    const op = "r2BucketCredentialRepairClaim"
    if (bucket.length === 0 || ownerId.length === 0 || !Number.isFinite(now) || !Number.isFinite(leaseMilliseconds))
      return resultErrorCreate(op, "The R2 bucket credential repair claim was invalid")
    const expiresAt = now + Math.max(1, leaseMilliseconds)
    try {
      const transaction = transactionInput ?? db
      transaction
        .insert(r2BucketCredentialRepairLockTable)
        .values({ bucket, ownerId, expiresAt })
        .onConflictDoNothing({ target: r2BucketCredentialRepairLockTable.bucket })
        .run()
      const existing = transaction
        .select({
          ownerId: r2BucketCredentialRepairLockTable.ownerId,
          expiresAt: r2BucketCredentialRepairLockTable.expiresAt,
        })
        .from(r2BucketCredentialRepairLockTable)
        .where(eq(r2BucketCredentialRepairLockTable.bucket, bucket))
        .get()
      if (existing?.ownerId === ownerId) {
        transaction
          .update(r2BucketCredentialRepairLockTable)
          .set({ expiresAt })
          .where(
            and(
              eq(r2BucketCredentialRepairLockTable.bucket, bucket),
              eq(r2BucketCredentialRepairLockTable.ownerId, ownerId),
            ),
          )
          .run()
        return { success: true, data: true }
      }
      if (existing !== undefined && existing.expiresAt > now) return { success: true, data: false }
      transaction
        .update(r2BucketCredentialRepairLockTable)
        .set({ ownerId, expiresAt })
        .where(
          and(
            eq(r2BucketCredentialRepairLockTable.bucket, bucket),
            lte(r2BucketCredentialRepairLockTable.expiresAt, now),
          ),
        )
        .run()
      const claimed = transaction
        .select({ ownerId: r2BucketCredentialRepairLockTable.ownerId })
        .from(r2BucketCredentialRepairLockTable)
        .where(eq(r2BucketCredentialRepairLockTable.bucket, bucket))
        .get()
      return { success: true, data: claimed?.ownerId === ownerId }
    } catch (error) {
      return resultErrorCreate(op, "The R2 bucket credential repair could not be claimed", error)
    }
  }

  const r2BucketCredentialRepairRelease: RepairRelease = ({ bucket, ownerId }, transactionInput) => {
    const op = "r2BucketCredentialRepairRelease"
    if (bucket.length === 0 || ownerId.length === 0)
      return resultErrorCreate(op, "The R2 bucket credential repair release was invalid")
    try {
      const transaction = transactionInput ?? db
      const existing = transaction
        .select({ ownerId: r2BucketCredentialRepairLockTable.ownerId })
        .from(r2BucketCredentialRepairLockTable)
        .where(eq(r2BucketCredentialRepairLockTable.bucket, bucket))
        .get()
      if (existing?.ownerId !== ownerId) return { success: true, data: false }
      transaction
        .delete(r2BucketCredentialRepairLockTable)
        .where(
          and(
            eq(r2BucketCredentialRepairLockTable.bucket, bucket),
            eq(r2BucketCredentialRepairLockTable.ownerId, ownerId),
          ),
        )
        .run()
      return { success: true, data: true }
    } catch (error) {
      return resultErrorCreate(op, "The R2 bucket credential repair could not be released", error)
    }
  }

  return {
    r2BucketCredentialRepairPendingCreate,
    r2BucketCredentialRepairPendingRead,
    r2BucketCredentialRepairPendingsRead,
    r2BucketCredentialRepairPendingDelete,
    r2BucketCredentialRepairClaim,
    r2BucketCredentialRepairRelease,
  }
}
