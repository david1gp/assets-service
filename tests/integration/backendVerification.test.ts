import { describe, expect, test } from "bun:test"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { catalogListsRender } from "../../src/catalog/catalogListsRender.js"
import { fontProcess } from "../../src/processing/fontProcess.js"
import { legacyImportPlanCreate } from "../../src/import/legacyImportPlanCreate.js"
import { imageProcess } from "../../src/processing/imageProcess.js"
import { videoProcess } from "../../src/processing/videoProcess.js"

const fixtureRoot = join(import.meta.dir, "../fixtures/contentoren")

describe("backend verification fixtures", () => {
  test("imports the checked-in Contentoren tree with merged transforms and generated metadata", async () => {
    const planned = await legacyImportPlanCreate(fixtureRoot, { showAiLabel: false })
    expect(planned.success).toBe(true)
    if (!planned.success) return

    expect(planned.data.conflicts).toEqual([])
    expect(planned.data.groups.map((group) => `${group.class}:${group.folders.join("/")}:${group.basename}`)).toEqual([
      "document:guides:guide",
      "font:ui:Inter-Regular",
      "image:home:hero",
      "video:home:intro",
    ])
    const image = planned.data.groups.find((group) => group.class === "image")
    expect(image).toMatchObject({
      folders: ["home"],
      basename: "hero",
      alt: "Contentoren hero AI: generated · fixture",
    })
    expect(image?.outputs.map((output) => output.key)).toEqual(["100x100_webp_ai_generated", "500x500_webp"])
    expect(image?.outputs.every((output) => output.kind !== "image" || output.showAiLabel === false)).toBe(true)
  })

  test("reports all source checksum conflicts without changing the fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "assets-service-contentoren-conflict-"))
    try {
      await cp(fixtureRoot, root, { recursive: true })
      const wrongPath = join(root, "images", "home", "100x100_webp_ai_generated", "hero.svg")
      await writeFile(wrongPath, '<svg xmlns="http://www.w3.org/2000/svg"/>\n')
      const planned = await legacyImportPlanCreate(root)
      expect(planned.success).toBe(true)
      if (!planned.success) return
      expect(planned.data.conflicts).toContainEqual(
        expect.objectContaining({
          code: "source_checksum_conflict",
          candidates: ["images/home/100x100_webp_ai_generated/hero.svg", "images/home/500x500_webp/hero.svg"],
        }),
      )
      expect(await readFile(join(fixtureRoot, "images/home/500x500_webp/hero.svg"), "utf8")).toContain("#2d5b8a")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("keeps optimizer image bounds, EXIF orientation, and AI-label byte behavior", async () => {
    const source = await sharp({
      create: { width: 2, height: 4, channels: 3, background: { r: 220, g: 220, b: 220 } },
    })
      .withMetadata({ orientation: 6 })
      .png()
      .toBuffer()
    const withoutLabel = await imageProcess({
      sourceBytes: source,
      width: 100,
      height: 100,
      format: "webp",
      aiProvenance: "generated",
      showAiLabel: false,
    })
    const withLabel = await imageProcess({
      sourceBytes: source,
      width: 100,
      height: 100,
      format: "webp",
      aiProvenance: "generated",
      showAiLabel: true,
    })
    expect(withoutLabel.success).toBe(true)
    expect(withLabel.success).toBe(true)
    if (!withoutLabel.success || !withLabel.success) return
    expect(withoutLabel.data.metadata).toMatchObject({ width: 4, height: 2, orientationApplied: true })
    expect(withoutLabel.data.metadata.width).toBeLessThanOrEqual(100)
    expect(withoutLabel.data.bytes).not.toEqual(withLabel.data.bytes)
  })

  test("renders equivalent catalog semantics deterministically despite remote/local paths", () => {
    const metadata = {
      kind: "image" as const,
      width: 10,
      height: 5,
      format: "webp" as const,
      colorSpace: "srgb" as const,
      alpha: false,
      orientationApplied: true,
      frameCount: 1,
      animated: false,
      alt: null,
      aiProvenance: null,
    }
    const remote = catalogListsRender([
      {
        class: "image",
        folders: ["home"],
        basename: "hero",
        key: "500x500_webp",
        path: "images/home/hero_v1.webp",
        mediaType: "image/webp",
        metadata,
      },
    ])
    const local = catalogListsRender([
      {
        class: "image",
        folders: ["home"],
        basename: "hero",
        key: "500x500_webp",
        path: "images/home/hero_0123abcd.webp",
        mediaType: "image/webp",
        metadata,
      },
    ])
    expect(remote.success).toBe(true)
    expect(local.success).toBe(true)
    if (!remote.success || !local.success) return
    expect(remote.data.imageList).toContain("home_hero_500x500_webp")
    expect(local.data.imageList).toContain("home_hero_500x500_webp")
    const normalizePathAndDigest = (value: string) =>
      value.replace("hero_v1", "hero_0123abcd").replace(/catalog-digest: [0-9a-f]+/gu, "catalog-digest: semantic")
    expect(normalizePathAndDigest(remote.data.imageList)).toBe(normalizePathAndDigest(local.data.imageList))
  })

  test("covers fixture video and font bytes through typed processing adapters and generated lists", async () => {
    const videoBytes = new Uint8Array(await readFile(join(fixtureRoot, "videos/home/intro.mp4")))
    const video = await videoProcess({ sourceBytes: videoBytes, sourceName: "intro.mp4" }, async () => ({
      success: true,
      data: {
        metadata: {
          kind: "video",
          width: 640,
          height: 360,
          durationSeconds: 1.5,
          frameRate: 30,
          container: "mp4",
          videoCodec: "h264",
          audioCodec: null,
          streams: 1,
          bitrate: null,
        },
        provenance: {
          schemaVersion: "assets-service.processing.v1",
          toolchain: [{ name: "fixture-probe", version: "1" }],
        },
      },
    }))
    expect(video.success).toBe(true)
    if (!video.success) return
    expect(video.data.bytes).toEqual(videoBytes)
    expect(video.data.metadata.width).toBe(640)

    const fontBytes = new Uint8Array(await readFile(join(fixtureRoot, "fonts/ui/Inter-Regular.woff2")))
    const font = fontProcess({ sourceBytes: fontBytes, sourceName: "Inter-Regular.woff2" }, () => ({
      success: true,
      data: {
        metadata: {
          kind: "font",
          family: "Inter",
          style: "normal",
          weight: 400,
          width: 5,
          variableAxes: [],
          glyphCount: 120,
          unicodeRanges: ["U+0000-00FF"],
          format: "woff2",
        },
        provenance: {
          schemaVersion: "assets-service.processing.v1",
          toolchain: [{ name: "fixture-probe", version: "1" }],
        },
      },
    }))
    expect(font.success).toBe(true)
    if (!font.success) return
    expect(font.data.bytes).toEqual(fontBytes)
    expect(font.data.metadata.family).toBe("Inter")

    expect(await readFile(join(fixtureRoot, "src/app/assets/imageList.ts"), "utf8")).toContain("home_hero")
    expect(await readFile(join(fixtureRoot, "src/app/assets/videoList.ts"), "utf8")).toContain("home_intro")
    expect(await readFile(join(fixtureRoot, "src/app/assets/fontList.ts"), "utf8")).toContain("ui_inter_regular")
    expect(await readFile(join(fixtureRoot, "src/app/assets/documentList.ts"), "utf8")).toContain("guides_guide")
  })
})
