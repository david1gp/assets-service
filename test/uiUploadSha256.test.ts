import { describe, expect, test } from "bun:test"

import { languageSignal } from "../src/ui/localization/languageSignal.js"
import { uiUploadSha256Read } from "../src/ui/upload/uiUploadSha256Read.js"

describe("uiUploadSha256Read", () => {
  test("localizes missing browser checksum support", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined, writable: true })
    languageSignal.set("de")
    try {
      expect(await uiUploadSha256Read(new Uint8Array([1, 2, 3]))).toEqual({
        success: false,
        op: "uiUploadSha256Read",
        errorMessage: "Dieser Browser kann keine Upload-Prüfsummen berechnen",
      })
    } finally {
      if (descriptor === undefined) delete (globalThis as { crypto?: Crypto }).crypto
      else Object.defineProperty(globalThis, "crypto", descriptor)
      languageSignal.set("en")
    }
  })

  test("localizes checksum computation failures", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { subtle: { digest: async () => Promise.reject(new Error("digest failed")) } },
      writable: true,
    })
    languageSignal.set("de")
    try {
      expect(await uiUploadSha256Read(new Uint8Array([1, 2, 3]))).toEqual({
        success: false,
        op: "uiUploadSha256Read",
        errorMessage: "Die Upload-Prüfsumme konnte nicht berechnet werden",
      })
    } finally {
      if (descriptor === undefined) delete (globalThis as { crypto?: Crypto }).crypto
      else Object.defineProperty(globalThis, "crypto", descriptor)
      languageSignal.set("en")
    }
  })
})
