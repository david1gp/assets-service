import { createCipheriv, createHash, randomBytes } from "node:crypto"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

const algorithm = "aes-256-gcm"
const version = "v1"

export const r2BucketCredentialEncrypt = (plaintext: string, masterKey: string): Result<string> => {
  const op = "r2BucketCredentialEncrypt"
  if (masterKey.length === 0) return resultErrorCreate(op, "The R2 credential encryption key is not configured")
  try {
    const iv = randomBytes(12)
    const cipher = createCipheriv(algorithm, encryptionKeyCreate(masterKey), iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    return {
      success: true,
      data: [
        version,
        iv.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        ciphertext.toString("base64url"),
      ].join("."),
    }
  } catch {
    return resultErrorCreate(op, "The R2 credential could not be encrypted")
  }
}

function encryptionKeyCreate(masterKey: string): Buffer {
  return createHash("sha256").update(masterKey, "utf8").digest()
}
