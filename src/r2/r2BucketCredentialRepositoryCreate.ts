import { asc, eq } from "drizzle-orm"
import * as v from "valibot"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { r2BucketCredentialTable } from "../infrastructure/db/schema/r2BucketCredentialTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { r2BucketCredentialCreateInputSchema } from "./r2BucketCredentialCreateInputSchema.js"
import { r2BucketCredentialDecrypt } from "./r2BucketCredentialDecrypt.js"
import { r2BucketCredentialEncrypt } from "./r2BucketCredentialEncrypt.js"
import type { R2BucketCredentialRepository } from "./r2BucketCredentialRepository.js"
import { type R2BucketCredential, r2BucketCredentialSchema } from "./r2BucketCredentialSchema.js"

type R2BucketCredentialRepositoryCreateOptions = {
  encryptionKey: string
  clock?: () => Date
}

export const r2BucketCredentialRepositoryCreate = (
  db: AssetDatabase,
  options: R2BucketCredentialRepositoryCreateOptions,
): R2BucketCredentialRepository => {
  const clock = options.clock ?? (() => new Date())

  const recordRead = (record: typeof r2BucketCredentialTable.$inferSelect, op: string): Result<R2BucketCredential> => {
    const accessKeyId = r2BucketCredentialDecrypt(record.accessKeyIdCiphertext, options.encryptionKey)
    if (!accessKeyId.success) return resultErrorCreate(op, "The stored R2 bucket credential was invalid")
    const secretAccessKey = r2BucketCredentialDecrypt(record.secretAccessKeyCiphertext, options.encryptionKey)
    if (!secretAccessKey.success) return resultErrorCreate(op, "The stored R2 bucket credential was invalid")
    const parsed = v.safeParse(r2BucketCredentialSchema, {
      bucket: record.bucket,
      accessKeyId: accessKeyId.data,
      secretAccessKey: secretAccessKey.data,
      revocationId: record.revocationId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })
    if (!parsed.success) return resultErrorCreate(op, "The stored R2 bucket credential was invalid")
    return { success: true, data: parsed.output }
  }

  const r2BucketCredentialCreate: R2BucketCredentialRepository["r2BucketCredentialCreate"] = (
    input,
    transactionInput,
  ) => {
    const op = "r2BucketCredentialCreate"
    const parsed = v.safeParse(r2BucketCredentialCreateInputSchema, input)
    if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues))

    let now: string
    try {
      now = new Date(clock()).toISOString()
    } catch (error) {
      return resultErrorCreate(op, "The R2 bucket credential timestamp could not be created", error)
    }
    const accessKeyId = r2BucketCredentialEncrypt(parsed.output.accessKeyId, options.encryptionKey)
    if (!accessKeyId.success) return resultErrorCreate(op, "The R2 bucket credential could not be persisted")
    const secretAccessKey = r2BucketCredentialEncrypt(parsed.output.secretAccessKey, options.encryptionKey)
    if (!secretAccessKey.success) return resultErrorCreate(op, "The R2 bucket credential could not be persisted")

    const transaction = transactionInput ?? db
    try {
      const existing = transaction
        .select({ createdAt: r2BucketCredentialTable.createdAt })
        .from(r2BucketCredentialTable)
        .where(eq(r2BucketCredentialTable.bucket, parsed.output.bucket))
        .get()
      transaction
        .insert(r2BucketCredentialTable)
        .values({
          bucket: parsed.output.bucket,
          accessKeyIdCiphertext: accessKeyId.data,
          secretAccessKeyCiphertext: secretAccessKey.data,
          revocationId: parsed.output.revocationId,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: r2BucketCredentialTable.bucket,
          set: {
            accessKeyIdCiphertext: accessKeyId.data,
            secretAccessKeyCiphertext: secretAccessKey.data,
            revocationId: parsed.output.revocationId,
            updatedAt: now,
          },
        })
        .run()
      const record = transaction
        .select()
        .from(r2BucketCredentialTable)
        .where(eq(r2BucketCredentialTable.bucket, parsed.output.bucket))
        .get()
      if (record === undefined) return resultErrorCreate(op, "The R2 bucket credential could not be persisted")
      return recordRead(record, op)
    } catch (error) {
      return resultErrorCreate(op, "The R2 bucket credential could not be persisted", error)
    }
  }

  const r2BucketCredentialRead: R2BucketCredentialRepository["r2BucketCredentialRead"] = (bucket, transactionInput) => {
    const op = "r2BucketCredentialRead"
    try {
      const record = (transactionInput ?? db)
        .select()
        .from(r2BucketCredentialTable)
        .where(eq(r2BucketCredentialTable.bucket, bucket))
        .get()
      if (record === undefined) return { success: true, data: null }
      return recordRead(record, op)
    } catch (error) {
      return resultErrorCreate(op, "The R2 bucket credential could not be read", error)
    }
  }

  const r2BucketCredentialsRead: R2BucketCredentialRepository["r2BucketCredentialsRead"] = (transactionInput) => {
    const op = "r2BucketCredentialsRead"
    try {
      const records = (transactionInput ?? db)
        .select()
        .from(r2BucketCredentialTable)
        .orderBy(asc(r2BucketCredentialTable.bucket))
        .all()
      const credentials: R2BucketCredential[] = []
      for (const record of records) {
        const credential = recordRead(record, op)
        if (!credential.success) return credential
        credentials.push(credential.data)
      }
      return { success: true, data: credentials }
    } catch (error) {
      return resultErrorCreate(op, "The R2 bucket credentials could not be read", error)
    }
  }

  const r2BucketCredentialDelete: R2BucketCredentialRepository["r2BucketCredentialDelete"] = (
    bucket,
    transactionInput,
  ) => {
    const op = "r2BucketCredentialDelete"
    try {
      const transaction = transactionInput ?? db
      const existing = transaction
        .select({ bucket: r2BucketCredentialTable.bucket })
        .from(r2BucketCredentialTable)
        .where(eq(r2BucketCredentialTable.bucket, bucket))
        .get()
      if (existing === undefined) return { success: true, data: false }
      transaction.delete(r2BucketCredentialTable).where(eq(r2BucketCredentialTable.bucket, bucket)).run()
      return { success: true, data: true }
    } catch (error) {
      return resultErrorCreate(op, "The R2 bucket credential could not be deleted", error)
    }
  }

  return { r2BucketCredentialCreate, r2BucketCredentialRead, r2BucketCredentialsRead, r2BucketCredentialDelete }
}
