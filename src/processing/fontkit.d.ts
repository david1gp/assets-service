declare module "fontkit" {
  type FontNameRecord = Record<string, Record<string, string>>

  type Font = {
    familyName?: string
    subfamilyName?: string
    italicAngle?: number
    numGlyphs?: number
    characterSet?: number[]
    variationAxes?: Record<string, unknown>
    copyright?: string
    ["OS/2"]?: {
      usWeightClass?: number
      usWidthClass?: number
    }
    name?: {
      records?: FontNameRecord
    }
  }

  export function create(buffer: Uint8Array): Font
}
