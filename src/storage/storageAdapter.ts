import type { Result } from "../schemas/resultSchema.js"
import type { StorageObjectLocation } from "./storageObjectLocation.js"
import type { StorageObject } from "./storageObjectSchema.js"
import type { StorageProbeResult } from "./storageProbeResult.js"
import type { StorageUploadIntent } from "./storageUploadIntentSchema.js"

export type StorageAdapter = {
  createSignedUploadIntent: (input: {
    location: StorageObjectLocation & { bucket: string; objectKey: string }
    byteSize: number
    mediaType: string
    sha256?: string
    expiresInSeconds: number
    now?: Date
  }) => Promise<Result<StorageUploadIntent>>
  headObject: (
    location: StorageObjectLocation & { bucket: string; objectKey: string },
  ) => Promise<Result<StorageObject | null>>
  readObject: (
    location: StorageObjectLocation & { bucket: string; objectKey: string },
  ) => Promise<Result<Uint8Array | null>>
  readObjectStream?: (
    location: StorageObjectLocation & { bucket: string; objectKey: string },
  ) => Promise<Result<ReadableStream<Uint8Array> | null>>
  putImmutable: (input: {
    location: StorageObjectLocation & { bucket: string; objectKey: string }
    bytes: Uint8Array
    mediaType: string
    sha256?: string
  }) => Promise<Result<StorageObject>>
  copyImmutable: (input: {
    source: StorageObjectLocation & { bucket: string; objectKey: string }
    destination: StorageObjectLocation & { bucket: string; objectKey: string }
    mediaType?: string
    sha256?: string
  }) => Promise<Result<StorageObject>>
  deleteObject: (location: StorageObjectLocation & { bucket: string; objectKey: string }) => Promise<Result<void>>
  listObjects?: (input: {
    bucket: string
    prefix?: string
    continuationToken?: string
    maxKeys?: number
  }) => Promise<Result<{ objects: readonly StorageObject[]; nextContinuationToken: string | null }>>
  probeCredentials: (bucket: string) => Promise<Result<StorageProbeResult>>
}
