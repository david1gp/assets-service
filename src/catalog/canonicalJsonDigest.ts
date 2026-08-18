import { createHash } from "node:crypto"

import { canonicalJsonStringify } from "./canonicalJsonStringify.js"

export const canonicalJsonDigest = (value: unknown): string =>
  createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex")
