import type { AssetIdentity } from "./assetIdentitySchema.js"

export const assetIdentityKeyCreate = (identity: AssetIdentity): string =>
  JSON.stringify([
    identity.projectId,
    identity.class,
    ...identity.folders.map((folder) => folder.normalize("NFC")),
    identity.basename.normalize("NFC"),
  ])
