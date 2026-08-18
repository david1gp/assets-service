import { describe, expect, test } from "bun:test"

import { uploadMediaTypeCheck } from "../src/upload/uploadMediaTypeCheck.js"
import { uploadSupportedMediaTypes } from "../src/upload/uploadSupportedMediaTypes.js"
import { storageMediaTypeDetect } from "../src/storage/storageMediaTypeDetect.js"
import { uiUploadAcceptAttributeRead } from "../src/ui/upload/uiUploadAcceptAttributeRead.js"
import { uiUploadMediaTypeRead } from "../src/ui/upload/uiUploadMediaTypeRead.js"

const fileCreate = (name: string, type: string) => new File([new Uint8Array([1, 2, 3])], name, { type })

describe("uploadMediaTypeCheck", () => {
  test("accepts every supported type, with parameters and casing normalized", () => {
    for (const mediaType of uploadSupportedMediaTypes)
      expect(uploadMediaTypeCheck(mediaType)).toEqual({ success: true, data: mediaType })
    expect(uploadMediaTypeCheck("IMAGE/PNG; charset=binary")).toEqual({ success: true, data: "image/png" })
  })

  test("rejects SVG and names the accepted types", () => {
    const rejected = uploadMediaTypeCheck("image/svg+xml")
    expect(rejected.success).toBe(false)
    if (rejected.success) return
    expect(rejected.errorMessage).toContain("image/svg+xml is not allowed")
    expect(rejected.errorMessage).toContain("image/png")
  })

  test("rejects an empty type without claiming a name", () => {
    const rejected = uploadMediaTypeCheck("")
    expect(rejected.success).toBe(false)
    if (rejected.success) return
    expect(rejected.errorMessage).toContain("An empty media type")
  })

  test("only allows types the storage layer can detect from bytes", () => {
    // Every allowed type must be verifiable, otherwise completion fails after a
    // successful transfer, which is what produced the SVG 500.
    const detectable = new Set([
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/avif",
      "video/mp4",
      "video/webm",
      "font/woff",
      "font/woff2",
      "font/otf",
      "font/ttf",
    ])
    for (const mediaType of uploadSupportedMediaTypes) expect(detectable.has(mediaType)).toBe(true)
  })
})

describe("storageMediaTypeDetect", () => {
  test("does not guess a type for SVG markup", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>')
    const detected = storageMediaTypeDetect(svg)
    expect(detected.success).toBe(false)
    if (detected.success) return
    expect(detected.errorMessage).toContain("could not be detected")
  })
})

describe("uiUploadMediaTypeRead", () => {
  test("passes a supported declared type through", () => {
    expect(uiUploadMediaTypeRead(fileCreate("hero.png", "image/png"))).toEqual({ success: true, data: "image/png" })
  })

  test("rejects a declared SVG type before an intent is requested", () => {
    const result = uiUploadMediaTypeRead(fileCreate("logo.svg", "image/svg+xml"))
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toContain("not allowed")
  })

  test("rejects an SVG extension when the browser reports no type", () => {
    const result = uiUploadMediaTypeRead(fileCreate("logo.svg", ""))
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toContain(".svg are not supported")
  })

  test("falls back to the extension for a supported file without a type", () => {
    expect(uiUploadMediaTypeRead(fileCreate("Inter.woff2", ""))).toEqual({ success: true, data: "font/woff2" })
  })

  test("explains a file that has no extension at all", () => {
    const result = uiUploadMediaTypeRead(fileCreate("hero", ""))
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toContain("no extension")
  })
})

describe("uiUploadAcceptAttributeRead", () => {
  test("offers only supported types and never SVG", () => {
    const accept = uiUploadAcceptAttributeRead()
    expect(accept).toContain("image/png")
    expect(accept).toContain(".woff2")
    expect(accept).not.toContain("svg")
  })
})
