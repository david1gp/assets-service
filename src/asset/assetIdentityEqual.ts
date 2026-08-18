import { assetIdentityKeyCreate } from "./assetIdentityKeyCreate.js"
import type { AssetIdentity } from "./assetIdentitySchema.js"

export const assetIdentityEqual = (left: AssetIdentity, right: AssetIdentity): boolean =>
  assetIdentityKeyCreate(left) === assetIdentityKeyCreate(right)
