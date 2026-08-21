import type { Result } from "../schemas/resultSchema.js"
import type { StorageObjectLocation } from "../storage/storageObjectLocation.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import type { FixtureSeed } from "./fixtureDatabaseSeed.js"

export type FixtureStorageObject = {
  location: StorageObjectLocation & { bucket: string; objectKey: string }
  bytes: Uint8Array
  mediaType: string
  publicPath?: string
}

const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAEAQMAAACTPww9AAAABlBMVEX/AAD///9BHTQRAAAAAWJLR0QB/wIt3gAAAAtJREFUCNdjYIAAAAAIAAEvIN0xAAAAAElFTkSuQmCC"
const webpBase64 = "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AA/vuUAAA="
const videoFixtureBytes = new TextEncoder().encode("deterministic video fixture bytes")
const fontFixtureBytes = new TextEncoder().encode("deterministic font fixture bytes")
const documentFixtureBytes = new TextEncoder().encode("Contentoren document fixture.\n")

const bytesPad = (input: Uint8Array, size: number): Uint8Array => {
  const bytes = new Uint8Array(size)
  bytes.set(input)
  return bytes
}

const base64BytesRead = (value: string): Uint8Array =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0))

export const fixtureStorageObjectsCreate = (
  seed: FixtureSeed,
  origin: string,
): Result<readonly FixtureStorageObject[]> => {
  const binding = {
    projectId: seed.projectId,
    environment: "development" as const,
    bucket: "assets-development",
    prefix: seed.serviceProjectId,
    publicBaseUrl: origin,
  }
  const sourceLocation = storageObjectLocationCreate(binding, "private-source", seed.sourceImageObjectKey)
  if (!sourceLocation.success) return sourceLocation
  const videoSourceLocation = storageObjectLocationCreate(binding, "private-source", seed.sourceObjectKeys.intro)
  if (!videoSourceLocation.success) return videoSourceLocation
  const fontSourceLocation = storageObjectLocationCreate(binding, "private-source", seed.sourceObjectKeys.inter)
  if (!fontSourceLocation.success) return fontSourceLocation
  const documentSourceLocation = storageObjectLocationCreate(binding, "private-source", seed.sourceObjectKeys.guide)
  if (!documentSourceLocation.success) return documentSourceLocation
  const largeLocation = storageObjectLocationCreate(binding, "public-output", seed.heroOutputObjectKeys.large)
  if (!largeLocation.success) return largeLocation
  const smallLocation = storageObjectLocationCreate(binding, "public-output", seed.heroOutputObjectKeys.small)
  if (!smallLocation.success) return smallLocation
  const videoOutputLocation = storageObjectLocationCreate(binding, "public-output", seed.nonImageOutputObjectKeys.intro)
  if (!videoOutputLocation.success) return videoOutputLocation
  const fontOutputLocation = storageObjectLocationCreate(binding, "public-output", seed.nonImageOutputObjectKeys.inter)
  if (!fontOutputLocation.success) return fontOutputLocation
  const documentOutputLocation = storageObjectLocationCreate(
    binding,
    "public-output",
    seed.nonImageOutputObjectKeys.guide,
  )
  if (!documentOutputLocation.success) return documentOutputLocation

  const png = base64BytesRead(pngBase64)
  const webp = base64BytesRead(webpBase64)
  return {
    success: true,
    data: [
      { location: sourceLocation.data, bytes: bytesPad(png, 12_000), mediaType: "image/png" },
      { location: videoSourceLocation.data, bytes: bytesPad(videoFixtureBytes, 17_000), mediaType: "video/mp4" },
      { location: fontSourceLocation.data, bytes: bytesPad(fontFixtureBytes, 22_000), mediaType: "font/ttf" },
      { location: documentSourceLocation.data, bytes: bytesPad(documentFixtureBytes, 27_000), mediaType: "text/plain" },
      {
        location: largeLocation.data,
        bytes: bytesPad(webp, 64_000),
        mediaType: "image/webp",
        publicPath: seed.heroOutputObjectKeys.large,
      },
      {
        location: smallLocation.data,
        bytes: bytesPad(webp, 32_000),
        mediaType: "image/webp",
        publicPath: seed.heroOutputObjectKeys.small,
      },
      {
        location: videoOutputLocation.data,
        bytes: bytesPad(videoFixtureBytes, 480_000),
        mediaType: "video/mp4",
        publicPath: seed.nonImageOutputObjectKeys.intro,
      },
      {
        location: fontOutputLocation.data,
        bytes: bytesPad(fontFixtureBytes, 96_000),
        mediaType: "font/woff2",
        publicPath: seed.nonImageOutputObjectKeys.inter,
      },
      {
        location: documentOutputLocation.data,
        bytes: bytesPad(documentFixtureBytes, 32),
        mediaType: "text/plain",
        publicPath: seed.nonImageOutputObjectKeys.guide,
      },
    ],
  }
}
