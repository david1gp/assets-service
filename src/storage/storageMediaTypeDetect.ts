import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export const storageMediaTypeDetect = (bytes: Uint8Array): Result<string> => {
  const op = "storageMediaTypeDetect"
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return { success: true, data: "image/png" }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { success: true, data: "image/jpeg" }
  if (ascii(bytes, 0, 3) === "GIF") return { success: true, data: "image/gif" }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { success: true, data: "image/webp" }
  if (ascii(bytes, 4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(bytes, 8, 12)))
    return { success: true, data: "image/avif" }
  if (
    ascii(bytes, 4, 8) === "ftyp" &&
    ["isom", "iso2", "mp41", "mp42", "avc1", "M4V ", "3gp4", "3g2a", "qt  "].includes(ascii(bytes, 8, 12))
  )
    return { success: true, data: "video/mp4" }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { success: true, data: "video/webm" }
  if (ascii(bytes, 0, 4) === "wOFF") return { success: true, data: "font/woff" }
  if (ascii(bytes, 0, 4) === "wOF2") return { success: true, data: "font/woff2" }
  if (ascii(bytes, 0, 4) === "OTTO") return { success: true, data: "font/otf" }
  if (startsWith(bytes, [0x00, 0x01, 0x00, 0x00])) return { success: true, data: "font/ttf" }
  if (ascii(bytes, 0, 4) === "%PDF") return { success: true, data: "application/pdf" }
  const firstCharacter = new TextDecoder().decode(bytes).trimStart().slice(0, 1)
  if (firstCharacter === "{" || firstCharacter === "[") return { success: true, data: "application/json" }
  return resultErrorCreate(op, "The object media type could not be detected from its content")
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return new TextDecoder().decode(bytes.slice(start, end))
}
