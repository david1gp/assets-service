import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"

import { uiDestructiveButtonClassesRead } from "../src/ui/common/uiDestructiveButtonClassesRead.js"
import { uiErrorTextClassesRead } from "../src/ui/common/uiErrorTextClassesRead.js"
import { uiNoticeToneClassesRead } from "../src/ui/common/uiNoticeToneClassesRead.js"
import { uiStatusToneClassesRead } from "../src/ui/common/uiStatusToneClassesRead.js"
import { uiToastToneClassesRead } from "../src/ui/toast/uiToastToneClassesRead.js"

const uiFilesRead = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await uiFilesRead(path)))
    else if (path.endsWith(".ts") || path.endsWith(".tsx")) files.push(path)
  }
  return files
}

// Red and green shades at or below 600 do not clear WCAG AA against white or a
// light panel, so the app must not emit them. The tone helpers own the palette.
const bannedShades = /\b(?:bg|text|border|fill|from|to|ring)-(?:red|green|emerald)-(?:100|200|300|400|500|600)\b/g
const toneOwners = [
  "src/ui/common/uiStatusToneClassesRead.ts",
  "src/ui/common/uiNoticeToneClassesRead.ts",
  "src/ui/common/uiDestructiveButtonClassesRead.ts",
  "src/ui/toast/uiToastToneClassesRead.ts",
  "src/ui/common/uiErrorTextClassesRead.ts",
]

describe("app-owned status colors", () => {
  test("keeps dark filled badge backgrounds instead of the library variants", () => {
    expect(uiStatusToneClassesRead("positive")).toContain("bg-green-800")
    expect(uiStatusToneClassesRead("negative")).toContain("bg-red-800")
    expect(uiStatusToneClassesRead("positive")).not.toContain("green-500")
  })

  test("pairs dark notice text with light panels in both themes", () => {
    expect(uiNoticeToneClassesRead("negative")).toContain("text-red-900")
    expect(uiNoticeToneClassesRead("negative")).toContain("dark:text-red-100")
    expect(uiNoticeToneClassesRead("positive")).toContain("text-green-900")
    expect(uiNoticeToneClassesRead("caution")).toContain("text-amber-900")
  })

  test("overrides the library red button shades that fall under AA", () => {
    expect(uiDestructiveButtonClassesRead("filled")).toContain("bg-red-700")
    expect(uiDestructiveButtonClassesRead("filled")).not.toContain("bg-red-500")
    expect(uiDestructiveButtonClassesRead("outline")).toContain("text-red-700")
    expect(uiDestructiveButtonClassesRead("outline")).toContain("dark:text-red-300")
  })

  test("keeps inline error text readable in both themes", () => {
    expect(uiErrorTextClassesRead()).toBe("text-red-800 dark:text-red-300")
  })
})

describe("no low-contrast red or green outside the tone helpers", () => {
  test("every UI file uses the tone helpers instead of raw light shades", async () => {
    const files = await uiFilesRead("src/ui")
    const offenders: string[] = []
    for (const file of files) {
      if (toneOwners.includes(file)) continue
      const source = await readFile(file, "utf8")
      const matches = source.match(bannedShades)
      if (matches !== null) offenders.push(`${file}: ${[...new Set(matches)].join(", ")}`)
    }
    expect(offenders).toEqual([])
  })

  test("every red or green library variant carries an app class override", async () => {
    const files = await uiFilesRead("src/ui")
    const offenders: string[] = []
    for (const file of files) {
      const source = await readFile(file, "utf8")
      for (const match of source.matchAll(/variant="(filledRed|outlineRed|filledGreen)"/g)) {
        const window = source.slice(Math.max(0, match.index - 400), match.index + 400)
        if (!window.includes("uiDestructiveButtonClassesRead")) offenders.push(`${file}: ${match[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test("toasts always go through the app viewport, never the read-only library one", async () => {
    const files = await uiFilesRead("src/ui")
    const found: string[] = []
    for (const file of files) {
      const source = await readFile(file, "utf8")
      if (source.includes("#ui/interactive/toast/")) found.push(file)
    }
    expect(found).toEqual([])
  })

  test("keeps toast tones above AA in both themes", () => {
    expect(uiToastToneClassesRead("positive")).toBe("border-green-700 bg-green-900 text-green-100")
    expect(uiToastToneClassesRead("negative")).toBe("border-red-700 bg-red-900 text-red-100")
  })
})
