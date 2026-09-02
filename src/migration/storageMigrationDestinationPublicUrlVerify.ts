import { contentSha256Create } from "../schemas/contentSha256Create.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import { storagePutImmutable } from "../storage/storagePutImmutable.js"
import type { StorageMigrationBindingSnapshot } from "./storageMigrationBindingSnapshotSchema.js"

const probeCacheControl = "public, max-age=31536000, immutable"
const probeMediaType = "application/octet-stream"

export const storageMigrationDestinationPublicUrlVerify = async (input: {
  storage: StorageAdapter
  sourceBinding: StorageMigrationBindingSnapshot
  targetBinding: StorageMigrationBindingSnapshot
  fetchImplementation?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  randomUUID?: () => string
}): Promise<Result<null>> => {
  const op = "storageMigrationDestinationPublicUrlVerify"
  let probeLocation: Parameters<StorageAdapter["deleteObject"]>[0] | undefined
  let probeCreated = false
  let verification: Result<null>

  try {
    const probeId = (input.randomUUID ?? crypto.randomUUID)()
    const probeKey = `__migration_probe/${probeId}_v1.bin`
    const location = storageObjectLocationCreate(
      {
        projectId: input.targetBinding.projectId,
        environment: input.targetBinding.environment,
        bucket: input.targetBinding.bucket,
        prefix: input.targetBinding.prefix,
        publicBaseUrl: input.targetBinding.publicBaseUrl,
      },
      "public-output",
      probeKey,
    )
    if (!location.success) return location
    probeLocation = location.data

    const probeBytes = new TextEncoder().encode(`assets-service-migration-probe:${probeId}`)
    const probeSha256 = contentSha256Create(probeBytes)
    const stored = await storagePutImmutable(input.storage, {
      location: location.data,
      bytes: probeBytes,
      mediaType: probeMediaType,
      sha256: probeSha256,
    })
    if (!stored.success) {
      verification = stored
    } else {
      probeCreated = true
      const storedMetadata = storageMigrationProbeMetadataVerify(
        stored.data,
        location.data.objectKey,
        probeBytes,
        probeSha256,
      )
      if (!storedMetadata.success) {
        verification = storedMetadata
      } else {
        const url = storageMigrationPublicProbeUrlCreate(input.targetBinding.publicBaseUrl, probeKey)
        const fetched = await storageMigrationPublicProbeFetch(
          url,
          probeBytes,
          probeSha256,
          input.fetchImplementation ?? fetch,
        )
        verification = fetched
      }
    }
  } catch (error) {
    verification = resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }

  if (!probeCreated || probeLocation === undefined) return verification

  let cleanup: Result<void>
  try {
    cleanup = await input.storage.deleteObject(probeLocation)
  } catch (error) {
    cleanup = resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
  if (!cleanup.success)
    return resultErrorCreate(
      op,
      "Destination public URL probe cleanup failed; settings were not changed",
      { cleanup: cleanup.errorMessage, verification: verification.success ? undefined : verification.errorMessage },
      { retryable: false },
    )
  const conflict = storageMigrationPublicUrlConflictCreate(input, verification)
  if (conflict !== null) return conflict
  return verification
}

function storageMigrationProbeMetadataVerify(
  stored: { key: string; byteSize: number; mediaType?: string; sha256?: string; cacheControl?: string },
  expectedKey: string,
  expectedBytes: Uint8Array,
  expectedSha256: string,
): Result<null> {
  const op = "storageMigrationDestinationPublicUrlVerify"
  if (stored.key !== expectedKey) return resultErrorCreate(op, "Destination probe object key did not match")
  if (stored.byteSize !== expectedBytes.byteLength)
    return resultErrorCreate(op, "Destination probe object size did not match")
  if (stored.sha256 !== expectedSha256) return resultErrorCreate(op, "Destination probe object checksum did not match")
  if (stored.mediaType !== probeMediaType)
    return resultErrorCreate(op, "Destination probe object content type did not match")
  if (stored.cacheControl !== probeCacheControl)
    return resultErrorCreate(op, "Destination probe object cache policy did not match")
  return { success: true, data: null }
}

async function storageMigrationPublicProbeFetch(
  url: URL,
  expectedBytes: Uint8Array,
  expectedSha256: string,
  fetchImplementation: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): Promise<Result<null>> {
  const op = "storageMigrationDestinationPublicUrlVerify"
  let response: Response
  try {
    response = await fetchImplementation(url, { method: "GET", redirect: "manual" })
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
  if (response.redirected) return resultErrorCreate(op, "Destination public URL probe followed a redirect")
  if (response.status >= 300 && response.status < 400)
    return resultErrorCreate(op, `Destination public URL probe received redirect status ${response.status}`)
  if (response.status !== 200)
    return resultErrorCreate(op, `Destination public URL probe failed with status ${response.status}`)

  const cacheControl = response.headers.get("cache-control")
  if (cacheControl !== probeCacheControl)
    return resultErrorCreate(op, "Destination public URL probe cache policy did not match", { cacheControl })
  const mediaType = response.headers.get("content-type")
  if (mediaType !== probeMediaType)
    return resultErrorCreate(op, "Destination public URL probe content type did not match", { mediaType })

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
  if (bytes.byteLength !== expectedBytes.byteLength)
    return resultErrorCreate(op, "Destination public URL probe byte size did not match")
  if (contentSha256Create(bytes) !== expectedSha256)
    return resultErrorCreate(op, "Destination public URL probe content did not match")
  return { success: true, data: null }
}

function storageMigrationPublicProbeUrlCreate(baseUrl: string, key: string): URL {
  const url = new URL(baseUrl)
  const basePath = url.pathname.replace(/\/+$/, "")
  url.pathname = `${basePath}/${key.split("/").map(encodeURIComponent).join("/")}`
  url.search = ""
  url.hash = ""
  return url
}

function storageMigrationPublicUrlConflictCreate(
  input: { sourceBinding: StorageMigrationBindingSnapshot; targetBinding: StorageMigrationBindingSnapshot },
  verification: Result<null>,
): Result<never> | null {
  if (verification.success || input.sourceBinding.bucket === input.targetBinding.bucket) return null
  try {
    if (new URL(input.sourceBinding.publicBaseUrl).toString() !== new URL(input.targetBinding.publicBaseUrl).toString())
      return null
  } catch {
    if (input.sourceBinding.publicBaseUrl !== input.targetBinding.publicBaseUrl) return null
  }
  return resultErrorCreate(
    "storageMigrationDestinationPublicUrlVerify",
    `Public URL conflict: ${input.targetBinding.publicBaseUrl} is not serving the new target bucket ${input.targetBinding.bucket}; reattach the domain before retrying`,
    { verification: verification.errorMessage },
    { retryable: false },
  )
}
