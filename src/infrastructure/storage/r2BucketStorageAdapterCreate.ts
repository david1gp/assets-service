import { contentSha256Create } from "../../schemas/contentSha256Create.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { StorageAdapter } from "../../storage/storageAdapter.js"
import type { R2BucketStorageAdapterOptions } from "./r2BucketStorageAdapterOptions.js"
import { r2StorageAdapterCreate } from "./r2StorageAdapter.js"
import type { R2StorageAdapterOptions } from "./r2StorageAdapterOptions.js"

export const r2BucketStorageAdapterCreate = (input: R2BucketStorageAdapterOptions): StorageAdapter => {
  const adapterOptions = {
    accountId: input.accountId,
    endpoint: input.endpoint,
    ...(input.fetchImplementation === undefined ? {} : { fetchImplementation: input.fetchImplementation }),
    ...(input.now === undefined ? {} : { now: input.now }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  } satisfies Pick<R2StorageAdapterOptions, "accountId" | "endpoint" | "fetchImplementation" | "now" | "timeoutMs">

  const adapterResolve = (
    bucket: string,
    credentialOverride?: { accessKeyId: string; secretAccessKey: string },
  ): Result<StorageAdapter> => {
    const op = "r2BucketStorageAdapterResolve"
    if (bucket.length === 0) return resultErrorCreate(op, "The R2 bucket is required")
    if (credentialOverride !== undefined)
      return {
        success: true,
        data: r2StorageAdapterCreate({
          ...adapterOptions,
          accessKeyId: credentialOverride.accessKeyId,
          secretAccessKey: credentialOverride.secretAccessKey,
        }),
      }
    const credential = input.credentialRepository.r2BucketCredentialRead(bucket)
    if (!credential.success) return credential
    if (credential.data !== null)
      return {
        success: true,
        data: r2StorageAdapterCreate({
          ...adapterOptions,
          accessKeyId: credential.data.accessKeyId,
          secretAccessKey: credential.data.secretAccessKey,
        }),
      }
    if (input.bootstrapCredential === undefined)
      return resultErrorCreate(op, `No persisted R2 credential exists for bucket ${bucket}`)
    return {
      success: true,
      data: r2StorageAdapterCreate({
        ...adapterOptions,
        accessKeyId: input.bootstrapCredential.accessKeyId,
        secretAccessKey: input.bootstrapCredential.secretAccessKey,
      }),
    }
  }

  return {
    createSignedUploadIntent: async (intentInput) => {
      const adapter = adapterResolve(intentInput.location.bucket)
      if (!adapter.success) return adapter
      return adapter.data.createSignedUploadIntent(intentInput)
    },
    headObject: async (location) => {
      const adapter = adapterResolve(location.bucket)
      if (!adapter.success) return adapter
      return adapter.data.headObject(location)
    },
    readObject: async (location) => {
      const adapter = adapterResolve(location.bucket)
      if (!adapter.success) return adapter
      return adapter.data.readObject(location)
    },
    readObjectStream: async (location) => {
      const adapter = adapterResolve(location.bucket)
      if (!adapter.success) return adapter
      if (adapter.data.readObjectStream !== undefined) return adapter.data.readObjectStream(location)
      const object = await adapter.data.readObject(location)
      if (!object.success) return object
      if (object.data === null) return { success: true, data: null }
      const bytes = object.data
      return {
        success: true,
        data: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes)
            controller.close()
          },
        }),
      }
    },
    listObjects: async (listInput) => {
      const adapter = adapterResolve(listInput.bucket)
      if (!adapter.success) return adapter
      if (adapter.data.listObjects === undefined)
        return resultErrorCreate("r2BucketStorageAdapterCreate", "R2 object listing is not configured")
      return adapter.data.listObjects(listInput)
    },
    putImmutable: async (putInput) => {
      const adapter = adapterResolve(putInput.location.bucket)
      if (!adapter.success) return adapter
      return adapter.data.putImmutable(putInput)
    },
    copyImmutable: async (copyInput) => copyImmutableResolve(copyInput),
    deleteObject: async (location) => {
      const adapter = adapterResolve(location.bucket)
      if (!adapter.success) return adapter
      return adapter.data.deleteObject(location)
    },
    probeCredentials: async (bucket, credentialOverride) => {
      const adapter = adapterResolve(bucket, credentialOverride)
      if (!adapter.success) return adapter
      return adapter.data.probeCredentials(bucket)
    },
  }

  async function copyImmutableResolve(
    copyInput: Parameters<StorageAdapter["copyImmutable"]>[0],
  ): ReturnType<StorageAdapter["copyImmutable"]> {
    if (copyInput.source.bucket === copyInput.destination.bucket) {
      const adapter = adapterResolve(copyInput.destination.bucket)
      if (!adapter.success) return adapter
      return adapter.data.copyImmutable(copyInput)
    }

    const sourceAdapter = adapterResolve(copyInput.source.bucket)
    if (!sourceAdapter.success) return sourceAdapter
    const destinationAdapter = adapterResolve(copyInput.destination.bucket)
    if (!destinationAdapter.success) return destinationAdapter
    const source = await sourceAdapter.data.headObject(copyInput.source)
    if (!source.success) return source
    if (source.data === null) return resultErrorCreate("r2BucketStorageAdapterCreate", "Source object is missing")
    if (copyInput.sourceEtag !== undefined && source.data.etag !== copyInput.sourceEtag)
      return resultErrorCreate("r2BucketStorageAdapterCreate", "Source object changed during copy")
    const mediaType = copyInput.mediaType ?? source.data.mediaType
    if (mediaType === undefined)
      return resultErrorCreate("r2BucketStorageAdapterCreate", "Source object metadata is incomplete")
    const sourceBytes = await sourceAdapter.data.readObject(copyInput.source)
    if (!sourceBytes.success) return sourceBytes
    if (sourceBytes.data === null) return resultErrorCreate("r2BucketStorageAdapterCreate", "Source object is missing")
    return destinationAdapter.data.putImmutable({
      location: copyInput.destination,
      bytes: sourceBytes.data,
      mediaType,
      sha256: copyInput.sha256 ?? source.data.sha256 ?? contentSha256Create(sourceBytes.data),
    })
  }
}
