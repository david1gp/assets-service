import { expect, test } from "bun:test"
import { eq } from "drizzle-orm"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { r2BucketCredentialRepairLockTable } from "../src/infrastructure/db/schema/r2BucketCredentialRepairLockTable.js"
import { r2BucketCredentialRepairPendingTable } from "../src/infrastructure/db/schema/r2BucketCredentialRepairPendingTable.js"
import { r2BucketCredentialTable } from "../src/infrastructure/db/schema/r2BucketCredentialTable.js"
import { r2BucketCredentialRepairPendingRepositoryCreate } from "../src/r2/r2BucketCredentialRepairPendingRepositoryCreate.js"
import { r2BucketCredentialRepairRecoveryRepositoryCreate } from "../src/r2/r2BucketCredentialRepairRecoveryRepositoryCreate.js"
import { r2BucketCredentialRepositoryCreate } from "../src/r2/r2BucketCredentialRepositoryCreate.js"

test("R2 bucket credential repository encrypts, rotates, and removes credentials", () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return
  try {
    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    const repository = r2BucketCredentialRepositoryCreate(opened.data.db, {
      encryptionKey: "test-master-key",
      clock: () => new Date("2026-09-01T00:00:00.000Z"),
    })
    const first = repository.r2BucketCredentialCreate({
      bucket: "assets",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      revocationId: "token-1",
    })
    expect(first).toMatchObject({
      success: true,
      data: {
        bucket: "assets",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        revocationId: "token-1",
      },
    })

    const stored = opened.data.db
      .select()
      .from(r2BucketCredentialTable)
      .where(eq(r2BucketCredentialTable.bucket, "assets"))
      .get()
    expect(stored).toBeDefined()
    expect(stored?.accessKeyIdCiphertext).not.toContain("access-key")
    expect(stored?.secretAccessKeyCiphertext).not.toContain("secret-key")
    expect(repository.r2BucketCredentialRead("assets")).toMatchObject({
      success: true,
      data: first.success ? first.data : null,
    })
    expect(repository.r2BucketCredentialRead("missing")).toEqual({ success: true, data: null })

    const imported = repository.r2BucketCredentialCreate({
      bucket: "imported-assets",
      accessKeyId: "imported-access-key",
      secretAccessKey: "imported-secret-key",
      revocationId: null,
    })
    expect(imported).toMatchObject({
      success: true,
      data: {
        bucket: "imported-assets",
        accessKeyId: "imported-access-key",
        secretAccessKey: "imported-secret-key",
        revocationId: null,
      },
    })
    const importedStored = opened.data.db
      .select()
      .from(r2BucketCredentialTable)
      .where(eq(r2BucketCredentialTable.bucket, "imported-assets"))
      .get()
    expect(importedStored?.revocationId).toBeNull()
    expect(importedStored?.accessKeyIdCiphertext).not.toContain("imported-access-key")
    expect(importedStored?.secretAccessKeyCiphertext).not.toContain("imported-secret-key")
    expect(repository.r2BucketCredentialRead("imported-assets")).toMatchObject({
      success: true,
      data: imported.success ? imported.data : null,
    })

    const wrongKeyRepository = r2BucketCredentialRepositoryCreate(opened.data.db, { encryptionKey: "wrong-key" })
    expect(wrongKeyRepository.r2BucketCredentialRead("assets").success).toBe(false)

    const rotated = r2BucketCredentialRepositoryCreate(opened.data.db, {
      encryptionKey: "test-master-key",
      clock: () => new Date("2026-09-02T00:00:00.000Z"),
    }).r2BucketCredentialCreate({
      bucket: "assets",
      accessKeyId: "access-key-2",
      secretAccessKey: "secret-key-2",
      revocationId: "token-2",
    })
    expect(rotated).toMatchObject({
      success: true,
      data: { accessKeyId: "access-key-2", secretAccessKey: "secret-key-2", revocationId: "token-2" },
    })
    expect(rotated.success && first.success ? rotated.data.createdAt : "").toBe("2026-09-01T00:00:00.000Z")
    expect(rotated.success && first.success ? rotated.data.updatedAt : "").toBe("2026-09-02T00:00:00.000Z")

    const importedRotated = repository.r2BucketCredentialCreate({
      bucket: "imported-assets",
      accessKeyId: "imported-access-key-2",
      secretAccessKey: "imported-secret-key-2",
      revocationId: "imported-token",
    })
    expect(importedRotated).toMatchObject({ success: true, data: { revocationId: "imported-token" } })

    const ciphertext = opened.data.db
      .select()
      .from(r2BucketCredentialTable)
      .where(eq(r2BucketCredentialTable.bucket, "assets"))
      .get()
    if (ciphertext === undefined) return
    opened.data.db
      .update(r2BucketCredentialTable)
      .set({ secretAccessKeyCiphertext: `${ciphertext.secretAccessKeyCiphertext}tampered` })
      .where(eq(r2BucketCredentialTable.bucket, "assets"))
      .run()
    expect(repository.r2BucketCredentialRead("assets").success).toBe(false)
    expect(repository.r2BucketCredentialDelete("assets")).toEqual({ success: true, data: true })
    expect(repository.r2BucketCredentialDelete("assets")).toEqual({ success: true, data: false })
  } finally {
    databaseClose(opened.data)
  }
})

test("R2 credential repair pending repository durably retains and decrypts rollback state", () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return
  try {
    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    const repository = r2BucketCredentialRepairPendingRepositoryCreate(opened.data.db, "test-master-key")
    const previousCredential = {
      bucket: "assets",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      revocationId: "token-1",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    }
    expect(
      repository.r2BucketCredentialRepairPendingCreate({
        bucket: "assets",
        previousCredential,
        replacementRevocationId: "token-2",
      }),
    ).toMatchObject({
      success: true,
      data: { bucket: "assets", previousCredential, replacementRevocationId: "token-2" },
    })

    const stored = opened.data.db
      .select()
      .from(r2BucketCredentialRepairPendingTable)
      .where(eq(r2BucketCredentialRepairPendingTable.bucket, "assets"))
      .get()
    expect(stored?.previousAccessKeyIdCiphertext).not.toContain("access-key")
    expect(stored?.previousSecretAccessKeyCiphertext).not.toContain("secret-key")
    expect(repository.r2BucketCredentialRepairPendingsRead()).toMatchObject({
      success: true,
      data: [{ bucket: "assets", previousCredential, replacementRevocationId: "token-2" }],
    })
    expect(repository.r2BucketCredentialRepairPendingDelete("assets")).toEqual({ success: true, data: true })
    expect(repository.r2BucketCredentialRepairPendingRead("assets")).toEqual({ success: true, data: null })

    expect(repository.r2BucketCredentialRepairClaim({ bucket: "assets", ownerId: "repair-a", now: 1000 })).toEqual({
      success: true,
      data: true,
    })
    expect(repository.r2BucketCredentialRepairClaim({ bucket: "assets", ownerId: "repair-b", now: 1001 })).toEqual({
      success: true,
      data: false,
    })
    expect(opened.data.db.select().from(r2BucketCredentialRepairLockTable).all()).toMatchObject([
      { bucket: "assets", ownerId: "repair-a" },
    ])
    expect(repository.r2BucketCredentialRepairRelease({ bucket: "assets", ownerId: "repair-b" })).toEqual({
      success: true,
      data: false,
    })
    expect(repository.r2BucketCredentialRepairRelease({ bucket: "assets", ownerId: "repair-a" })).toEqual({
      success: true,
      data: true,
    })
  } finally {
    databaseClose(opened.data)
  }
})

test("R2 credential repair recovery restores the previous credential and deletes pending state atomically", () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return
  try {
    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    const credentialRepository = r2BucketCredentialRepositoryCreate(opened.data.db, {
      encryptionKey: "test-master-key",
      clock: () => new Date("2026-09-13T00:00:00.000Z"),
    })
    const pendingRepository = r2BucketCredentialRepairPendingRepositoryCreate(opened.data.db, "test-master-key")
    const previousCredential = {
      bucket: "assets",
      accessKeyId: "access-key-old",
      secretAccessKey: "secret-key-old",
      revocationId: "token-old",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    }
    const replacementCredential = {
      bucket: "assets",
      accessKeyId: "access-key-replacement",
      secretAccessKey: "secret-key-replacement",
      revocationId: "token-replacement",
    }
    expect(credentialRepository.r2BucketCredentialCreate(replacementCredential).success).toBe(true)
    expect(
      pendingRepository.r2BucketCredentialRepairPendingCreate({
        bucket: "assets",
        previousCredential,
        replacementRevocationId: "token-replacement",
      }).success,
    ).toBe(true)

    const recoveryRepository = r2BucketCredentialRepairRecoveryRepositoryCreate(
      opened.data.db,
      credentialRepository,
      pendingRepository,
    )
    const restored = recoveryRepository.r2BucketCredentialRepairRecoveryRestorePreviousAndDeletePending({
      bucket: "assets",
      previousCredential,
    })

    expect(restored).toMatchObject({
      success: true,
      data: {
        bucket: "assets",
        accessKeyId: "access-key-old",
        secretAccessKey: "secret-key-old",
        revocationId: "token-old",
      },
    })
    expect(credentialRepository.r2BucketCredentialRead("assets")).toMatchObject({
      success: true,
      data: { accessKeyId: "access-key-old", secretAccessKey: "secret-key-old", revocationId: "token-old" },
    })
    expect(pendingRepository.r2BucketCredentialRepairPendingRead("assets")).toEqual({ success: true, data: null })
  } finally {
    databaseClose(opened.data)
  }
})

test("R2 credential repair recovery rolls back the credential restore when pending deletion fails", () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return
  try {
    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    const credentialRepository = r2BucketCredentialRepositoryCreate(opened.data.db, {
      encryptionKey: "test-master-key",
      clock: () => new Date("2026-09-13T00:00:00.000Z"),
    })
    const pendingRepository = r2BucketCredentialRepairPendingRepositoryCreate(opened.data.db, "test-master-key")
    const previousCredential = {
      bucket: "assets",
      accessKeyId: "access-key-old",
      secretAccessKey: "secret-key-old",
      revocationId: "token-old",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    }
    expect(
      credentialRepository.r2BucketCredentialCreate({
        bucket: "assets",
        accessKeyId: "access-key-replacement",
        secretAccessKey: "secret-key-replacement",
        revocationId: "token-replacement",
      }).success,
    ).toBe(true)
    expect(
      pendingRepository.r2BucketCredentialRepairPendingCreate({
        bucket: "assets",
        previousCredential,
        replacementRevocationId: "token-replacement",
      }).success,
    ).toBe(true)
    const failingPendingRepository = {
      ...pendingRepository,
      r2BucketCredentialRepairPendingDelete: () => ({
        success: false as const,
        op: "testPendingDelete",
        errorMessage: "pending delete failed",
      }),
    }
    const recoveryRepository = r2BucketCredentialRepairRecoveryRepositoryCreate(
      opened.data.db,
      credentialRepository,
      failingPendingRepository,
    )

    const result = recoveryRepository.r2BucketCredentialRepairRecoveryRestorePreviousAndDeletePending({
      bucket: "assets",
      previousCredential,
    })

    expect(result).toMatchObject({ success: false, op: "testPendingDelete" })
    expect(credentialRepository.r2BucketCredentialRead("assets")).toMatchObject({
      success: true,
      data: { accessKeyId: "access-key-replacement", secretAccessKey: "secret-key-replacement" },
    })
    expect(pendingRepository.r2BucketCredentialRepairPendingRead("assets")).toMatchObject({
      success: true,
      data: { bucket: "assets", replacementRevocationId: "token-replacement" },
    })
  } finally {
    databaseClose(opened.data)
  }
})
