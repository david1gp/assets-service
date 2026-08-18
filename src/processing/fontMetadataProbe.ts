import { create } from "fontkit"
import * as v from "valibot"

import { fontMetadataSchema } from "../metadata/fontMetadataSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { FontMetadataProbeResult } from "./fontMetadataProbeResult.js"

export const fontMetadataProbe = (sourceBytes: Uint8Array, sourceName?: string): Result<FontMetadataProbeResult> => {
  const op = "fontMetadataProbe"
  try {
    const font = create(Buffer.from(sourceBytes))
    const family = nonEmptyString(font.familyName)
    if (!family) {
      return resultErrorCreate(op, "font has no family name")
    }
    const subfamily = font.subfamilyName ?? ""
    const operatingSystemTable = font["OS/2"]
    const weight = integerOrFallback(operatingSystemTable?.usWeightClass, weightFromSubfamily(subfamily, 400))
    const width = integerOrFallback(operatingSystemTable?.usWidthClass, 5)
    const format = fontFormatResolve(sourceBytes, sourceName)
    if (!format) {
      return resultErrorCreate(op, "font format is not recognized")
    }
    const metadata = {
      kind: "font" as const,
      family,
      style: fontStyleResolve(subfamily, font.italicAngle),
      weight,
      width,
      variableAxes: Object.keys(font.variationAxes ?? {}).sort(),
      glyphCount: integerOrFallback(font.numGlyphs, 0),
      unicodeRanges: unicodeRangesResolve(font.characterSet ?? []),
      format,
      ...licenseResolve(font),
    }
    const validated = v.safeParse(fontMetadataSchema, metadata)
    if (!validated.success) {
      return resultErrorCreate(op, v.summarize(validated.issues), metadata)
    }
    return {
      success: true,
      data: {
        metadata: validated.output,
        provenance: {
          schemaVersion: "assets-service.processing.v1",
          toolchain: [{ name: "fontkit", version: "2.0.4" }],
        },
      },
    }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}

function fontFormatResolve(sourceBytes: Uint8Array, sourceName?: string): string | null {
  if (sourceBytes.length >= 4) {
    const signature = String.fromCharCode(...sourceBytes.slice(0, 4))
    if (signature === "wOF2") return "woff2"
    if (signature === "wOFF") return "woff"
    if (signature === "OTTO") return "otf"
    if (signature === "true") return "ttf"
    if (sourceBytes[0] === 0 && sourceBytes[1] === 1 && sourceBytes[2] === 0 && sourceBytes[3] === 0) return "ttf"
  }
  const extension = sourceName?.toLowerCase().match(/\.(ttf|otf|woff2|woff)$/)?.[1]
  return extension ?? null
}

function fontStyleResolve(subfamily: string, italicAngle: number | undefined): "normal" | "italic" {
  return (italicAngle !== undefined && italicAngle !== 0) || /italic|oblique/i.test(subfamily) ? "italic" : "normal"
}

function weightFromSubfamily(subfamily: string, fallback: number): number {
  const weights: Record<string, number> = {
    thin: 100,
    hairline: 100,
    extralight: 200,
    ultralight: 200,
    light: 300,
    regular: 400,
    book: 400,
    medium: 500,
    semibold: 600,
    demibold: 600,
    bold: 700,
    extrabold: 800,
    ultrabold: 800,
    black: 900,
    heavy: 900,
  }
  const normalized = subfamily.replaceAll(/[\s-]/g, "").toLowerCase()
  return weights[normalized] ?? fallback
}

function integerOrFallback(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback
}

function unicodeRangesResolve(characterSet: number[]): string[] {
  const sorted = [...new Set(characterSet.filter((value) => Number.isInteger(value) && value >= 0))].sort(
    (left, right) => left - right,
  )
  const ranges: string[] = []
  let start = sorted[0]
  let previous = sorted[0]
  for (const codePoint of sorted.slice(1)) {
    if (previous !== undefined && codePoint === previous + 1) {
      previous = codePoint
      continue
    }
    if (start !== undefined && previous !== undefined) {
      ranges.push(formatUnicodeRange(start, previous))
    }
    start = codePoint
    previous = codePoint
  }
  if (start !== undefined && previous !== undefined) {
    ranges.push(formatUnicodeRange(start, previous))
  }
  return ranges
}

function formatUnicodeRange(start: number, end: number): string {
  const startText = `U+${start.toString(16).toUpperCase().padStart(4, "0")}`
  return start === end ? startText : `${startText}-${end.toString(16).toUpperCase().padStart(4, "0")}`
}

function licenseResolve(font: ReturnType<typeof create>): { license?: { name?: string; url?: string; text?: string } } {
  const records = font.name?.records ?? {}
  const license = recordTextResolve(records.license)
  const licenseUrlCandidate = recordTextResolve(records.licenseURL)
  const licenseUrl = licenseUrlCandidate && URL.canParse(licenseUrlCandidate) ? licenseUrlCandidate : undefined
  const copyright = nonEmptyString(font.copyright)
  if (!license && !licenseUrl && !copyright) {
    return {}
  }
  return {
    license: {
      ...(licenseUrl ? { url: licenseUrl } : {}),
      ...(copyright || license ? { text: license ?? copyright } : {}),
    },
  }
}

function recordTextResolve(record: Record<string, string> | undefined): string | undefined {
  if (!record) return undefined
  return Object.values(record).find((value) => typeof value === "string" && value.length > 0)
}

function nonEmptyString(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined
}
