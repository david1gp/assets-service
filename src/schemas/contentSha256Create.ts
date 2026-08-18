import type { Sha256 } from "./sha256Schema.js"

export const contentSha256Create = (content: Uint8Array): Sha256 => {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(content)
  return hasher.digest("hex") as Sha256
}
