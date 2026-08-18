import { expect, test } from "bun:test"
import sharp from "sharp"
import * as v from "valibot"

import { imageProcess } from "../src/processing/imageProcess.js"
import { fontProcess } from "../src/processing/fontProcess.js"
import { processingProvenanceSchema } from "../src/processing/processingProvenanceSchema.js"
import { videoProcess } from "../src/processing/videoProcess.js"

test("image processing rotates before bounded resize and records actual output metadata", async () => {
  const sourceBytes = await sharp({
    create: { width: 100, height: 50, channels: 3, background: { r: 32, g: 64, b: 96 } },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer()

  const result = await imageProcess({ sourceBytes, width: 60, height: 60 })
  expect(result.success).toBe(true)
  if (!result.success) return

  expect(result.data.metadata).toMatchObject({
    width: 30,
    height: 60,
    format: "webp",
    orientationApplied: true,
    aiProvenance: null,
  })
  expect(v.safeParse(processingProvenanceSchema, result.data.provenance).success).toBe(true)
  expect((await sharp(result.data.bytes).metadata()).format).toBe("webp")
  const expected = await sharp(sourceBytes, { animated: false })
    .rotate()
    .resize({ width: 60, height: 60, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
  expect(Buffer.from(result.data.bytes).equals(expected)).toBe(true)
})

test("image processing supports every service image output format", async () => {
  const sourceBytes = await sharp({
    create: { width: 20, height: 10, channels: 3, background: { r: 32, g: 64, b: 96 } },
  })
    .png()
    .toBuffer()
  for (const format of ["jpg", "png", "webp", "avif"] as const) {
    const result = await imageProcess({ sourceBytes, width: 100, height: 100, format })
    expect(result.success).toBe(true)
    if (!result.success) continue
    expect(result.data.metadata).toMatchObject({ width: 20, height: 10, format })
  }
})

test("image processing keeps AI provenance explicit and label visibility overridable", async () => {
  const sourceBytes = await sharp({
    create: { width: 80, height: 60, channels: 3, background: { r: 220, g: 220, b: 220 } },
  })
    .png()
    .toBuffer()
  const plain = await imageProcess({ sourceBytes, width: 80, height: 60 })
  const hidden = await imageProcess({
    sourceBytes,
    width: 80,
    height: 60,
    aiProvenance: "generated",
    showAiLabel: false,
  })
  const visible = await imageProcess({ sourceBytes, width: 80, height: 60, aiProvenance: "generated" })
  expect(plain.success && hidden.success && visible.success).toBe(true)
  if (!plain.success || !hidden.success || !visible.success) return

  expect(Buffer.from(hidden.data.bytes).equals(Buffer.from(plain.data.bytes))).toBe(true)
  expect(Buffer.from(visible.data.bytes).equals(Buffer.from(plain.data.bytes))).toBe(false)
  expect(hidden.data.metadata.aiProvenance).toBe("generated")
  expect(hidden.data.metadata.showAiLabel).toBe(false)
  expect(visible.data.metadata.aiProvenance).toBe("generated")
})

test("video processing copies source bytes and probes typed metadata", async () => {
  const process = Bun.spawn(
    ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x18:r=5", "-t", "0.4", "-f", "matroska", "-"],
    { stdout: "pipe", stderr: "pipe" },
  )
  const [sourceBytes, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).arrayBuffer(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  expect(exitCode).toBe(0)
  expect(stderr).toBe("")

  const source = new Uint8Array(sourceBytes)
  const result = await videoProcess({ sourceBytes: source, sourceName: "generated.mkv" })
  expect(result.success).toBe(true)
  if (!result.success) return

  expect(Buffer.from(result.data.bytes).equals(Buffer.from(source))).toBe(true)
  expect(result.data.metadata).toMatchObject({ width: 32, height: 18, container: "matroska", streams: 1 })
  expect(result.data.provenance.toolchain[0]?.name).toBe("ffprobe")
})

test("font processing preserves already-woff2 source bytes and typed metadata", () => {
  const sourceBytes = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3])
  const result = fontProcess({ sourceBytes, sourceName: "Generated-Regular.woff2" }, () => ({
    success: true,
    data: {
      metadata: {
        kind: "font",
        family: "Generated",
        style: "normal",
        weight: 400,
        width: 5,
        variableAxes: [],
        glyphCount: 2,
        unicodeRanges: ["U+0020-U+007E"],
        format: "woff2",
      },
      provenance: {
        schemaVersion: "assets-service.processing.v1",
        toolchain: [{ name: "fixture-probe", version: "1" }],
      },
    },
  }))
  expect(result.success).toBe(true)
  if (!result.success) return

  expect(Buffer.from(result.data.sourceBytes).equals(Buffer.from(sourceBytes))).toBe(true)
  expect(Buffer.from(result.data.bytes).equals(Buffer.from(sourceBytes))).toBe(true)
  expect(result.data.outputFormat).toBe("woff2")
  expect(result.data.metadata.family).toBe("Generated")
  expect(result.data.provenance.toolchain).toEqual([{ name: "fixture-probe", version: "1" }])
})
