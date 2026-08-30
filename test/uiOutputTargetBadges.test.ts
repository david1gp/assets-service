import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import type { AssetListItem } from "../src/api-client/assetListItemSchema.js"
import type { OutputDefinition } from "../src/output/outputDefinitionSchema.js"
import { uiAssetOutputTargetsRead } from "../src/ui/output/uiAssetOutputTargetsRead.js"
import { uiOutputTargetLabelRead } from "../src/ui/output/uiOutputTargetLabelRead.js"

const imageDefinition: OutputDefinition = {
  id: "output-1",
  assetId: "asset-1",
  kind: "image",
  key: "1600x900_webp",
  width: 1600,
  height: 900,
  format: "webp",
}

describe("uiOutputTargetLabelRead", () => {
  test("labels an image target from its dimensions and format", () => {
    expect(uiOutputTargetLabelRead(imageDefinition)).toBe("1600×900 WEBP")
  })

  test("labels a font target from its format", () => {
    expect(uiOutputTargetLabelRead({ id: "o", assetId: "a", kind: "font", key: "woff2", format: "woff2" })).toBe(
      "WOFF2",
    )
  })

  test("labels video and document targets without parsing the key", () => {
    expect(uiOutputTargetLabelRead({ id: "o", assetId: "a", kind: "video", key: "a/b" })).toBe("Video")
    expect(uiOutputTargetLabelRead({ id: "o", assetId: "a", kind: "document", key: "default" })).toBe("Document")
  })

  test("never derives the label from the output key", () => {
    expect(uiOutputTargetLabelRead({ ...imageDefinition, key: "thumb_small" })).toBe("1600×900 WEBP")
  })
})

describe("uiAssetOutputTargetsRead", () => {
  const assetCreate = (outputHistory: AssetListItem["outputHistory"]): Pick<AssetListItem, "outputHistory"> => ({
    outputHistory,
  })

  test("returns every target of an asset in order", () => {
    const second: OutputDefinition = {
      ...imageDefinition,
      id: "output-2",
      key: "400x225_webp",
      width: 400,
      height: 225,
    }
    const targets = uiAssetOutputTargetsRead(
      assetCreate([
        { definition: imageDefinition, versions: [] },
        { definition: second, versions: [] },
      ]),
    )
    expect(targets.map(uiOutputTargetLabelRead)).toEqual(["1600×900 WEBP", "400×225 WEBP"])
  })

  test("returns no targets when the output history is missing", () => {
    expect(uiAssetOutputTargetsRead(assetCreate(undefined))).toEqual([])
  })
})

describe("output target chips in the asset UI", () => {
  test("renders the targets after the filename in the asset list, chip, and detail views", async () => {
    for (const path of [
      "src/ui/pages/UiAssetListPage.tsx",
      "src/ui/structure/UiStructureAssetChip.tsx",
      "src/ui/pages/UiAssetDetailPage.tsx",
    ]) {
      const source = await readFile(path, "utf8")
      expect(source).toContain("UiOutputTargetBadges")
      expect(source.indexOf("filename")).toBeLessThan(source.indexOf("<UiOutputTargetBadges"))
    }
  })

  test("keeps versions and object paths out of the target chip component", async () => {
    const source = await readFile("src/ui/output/UiOutputTargetBadges.tsx", "utf8")
    expect(source).not.toContain("objectKey")
    expect(source).not.toContain("versions")
  })
})
