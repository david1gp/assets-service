import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { assetIdentityKeyCreate } from "./assetIdentityKeyCreate.js"
import type { AssetIdentity } from "./assetIdentitySchema.js"

export const assetIdentitiesUniqueCheck = (identities: readonly AssetIdentity[]): Result<null> => {
  const op = "assetIdentitiesUniqueCheck"
  const keys = new Set<string>()

  for (const identity of identities) {
    const key = assetIdentityKeyCreate(identity)
    if (keys.has(key)) return resultErrorCreate(op, `Duplicate asset identity: ${key}`)
    keys.add(key)
  }

  return { success: true, data: null }
}
