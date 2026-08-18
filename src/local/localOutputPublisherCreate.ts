import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import { storageObjectVerify } from "../storage/storageObjectVerify.js"
import { storagePutImmutable } from "../storage/storagePutImmutable.js"
import type { LocalOutputPublisher } from "./localOutputPublisher.js"

export const localOutputPublisherCreate = (options: {
  adapter: StorageAdapter
  binding: StorageBinding
}): LocalOutputPublisher => {
  const sourceLocationRead = (sha256: string) =>
    storageObjectLocationCreate(options.binding, "private-source", `local-sources/${sha256}`)

  const probe = async (): Promise<Result<{ status: number }>> => {
    const checked = await options.adapter.probeCredentials(options.binding.bucket)
    if (!checked.success) return checked
    if (!checked.data.reachable) return resultErrorCreate("localOutputPublisherProbe", "R2 credentials were rejected")
    return { success: true, data: { status: checked.data.status } }
  }

  const publish = async (input: {
    path: string
    bytes: Uint8Array
    mediaType: string
    sha256: string
  }): Promise<Result<{ path: string; sha256: string }>> => {
    const location = storageObjectLocationCreate(options.binding, "public-output", input.path)
    if (!location.success) return location

    const existing = await options.adapter.headObject(location.data)
    if (!existing.success) return existing
    if (existing.data !== null) {
      if (
        existing.data.byteSize !== input.bytes.byteLength ||
        (existing.data.sha256 !== undefined && existing.data.sha256 !== input.sha256)
      )
        return resultErrorCreate("localOutputPublisherPublish", `The immutable output already differs: ${input.path}`)
    } else {
      const stored = await storagePutImmutable(options.adapter, {
        location: location.data,
        bytes: input.bytes,
        mediaType: input.mediaType,
        sha256: input.sha256,
      })
      if (!stored.success) {
        const raced = await options.adapter.headObject(location.data)
        if (!raced.success) return stored
        if (
          raced.data === null ||
          raced.data.byteSize !== input.bytes.byteLength ||
          (raced.data.sha256 !== undefined && raced.data.sha256 !== input.sha256)
        )
          return stored
      }
    }

    const verified = await storageObjectVerify(options.adapter, {
      location: location.data,
      byteSize: input.bytes.byteLength,
      sha256: input.sha256,
      mediaType: input.mediaType,
    })
    if (!verified.success) return verified
    return { success: true, data: { path: input.path, sha256: verified.data.sha256 } }
  }

  const publishSource = async (input: {
    bytes: Uint8Array
    mediaType: string
    sha256: string
  }): Promise<Result<{ sha256: string }>> => {
    const location = sourceLocationRead(input.sha256)
    if (!location.success) return location
    const existing = await options.adapter.headObject(location.data)
    if (!existing.success) return existing
    if (existing.data === null) {
      const stored = await storagePutImmutable(options.adapter, {
        location: location.data,
        bytes: input.bytes,
        mediaType: input.mediaType,
        sha256: input.sha256,
      })
      if (!stored.success) {
        const raced = await options.adapter.headObject(location.data)
        if (!raced.success || raced.data === null) return stored
      }
    } else if (
      existing.data.byteSize !== input.bytes.byteLength ||
      existing.data.sha256 !== input.sha256 ||
      existing.data.mediaType !== input.mediaType
    ) {
      return resultErrorCreate("localOutputPublisherPublishSource", "The immutable source already differs")
    }
    const verified = await storageObjectVerify(options.adapter, {
      location: location.data,
      byteSize: input.bytes.byteLength,
      sha256: input.sha256,
      mediaType: input.mediaType,
    })
    if (!verified.success) return verified
    return { success: true, data: { sha256: verified.data.sha256 } }
  }

  const readSource = async (sha256: string): Promise<Result<Uint8Array | null>> => {
    const location = sourceLocationRead(sha256)
    if (!location.success) return location
    return options.adapter.readObject(location.data)
  }

  const removeOutput = async (path: string): Promise<Result<undefined>> => {
    const location = storageObjectLocationCreate(options.binding, "public-output", path)
    if (!location.success) return location
    const deleted = await options.adapter.deleteObject(location.data)
    if (!deleted.success) return deleted
    return { success: true, data: undefined }
  }

  const removeSource = async (sha256: string): Promise<Result<undefined>> => {
    const location = sourceLocationRead(sha256)
    if (!location.success) return location
    const deleted = await options.adapter.deleteObject(location.data)
    if (!deleted.success) return deleted
    return { success: true, data: undefined }
  }

  return { probe, publishSource, readSource, removeOutput, removeSource, publish }
}
