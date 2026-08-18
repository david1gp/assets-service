import type { Result } from "../schemas/resultSchema.js"

export type LocalOutputPublisher = {
  probe: () => Promise<Result<{ status: number }>>
  publishSource?: (input: {
    bytes: Uint8Array
    mediaType: string
    sha256: string
  }) => Promise<Result<{ sha256: string }>>
  readSource?: (sha256: string) => Promise<Result<Uint8Array | null>>
  removeOutput?: (path: string) => Promise<Result<undefined>>
  removeSource?: (sha256: string) => Promise<Result<undefined>>
  publish: (input: {
    path: string
    bytes: Uint8Array
    mediaType: string
    sha256: string
  }) => Promise<Result<{ path: string; sha256: string }>>
}
