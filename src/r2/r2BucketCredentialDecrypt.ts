import { createDecipheriv, createHash } from "node:crypto"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

const algorithm = "aes-256-gcm"

export const r2BucketCredentialDecrypt = (ciphertext: string, masterKey: string): Result<string> => {
  const op = "r2BucketCredentialDecrypt"
  if (masterKey.length === 0) return resultErrorCreate(op, "The R2 credential encryption key is not configured")
  try {
    const parts = ciphertext.split(".")
    if (parts.length !== 4 || parts[0] !== "v1") throw new Error("invalid ciphertext")
    const iv = Buffer.from(parts[1] ?? "", "base64url")
    const authTag = Buffer.from(parts[2] ?? "", "base64url")
    const encrypted = Buffer.from(parts[3] ?? "", "base64url")
    if (iv.length !== 12 || authTag.length !== 16 || encrypted.length === 0) throw new Error("invalid ciphertext")
    const decipher = createDecipheriv(algorithm, encryptionKeyCreate(masterKey), iv)
    decipher.setAuthTag(authTag)
    return { success: true, data: Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8") }
  } catch {
    return resultErrorCreate(op, "The stored R2 credential could not be decrypted")
  }
}

function encryptionKeyCreate(masterKey: string): Buffer {
  return createHash("sha256").update(masterKey, "utf8").digest()
}
