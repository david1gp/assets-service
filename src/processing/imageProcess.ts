import sharp from "sharp"
import type { Sharp } from "sharp"
import * as v from "valibot"

import { imageMetadataSchema } from "../metadata/imageMetadataSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ImageProcessingAdapter } from "./imageProcessingAdapter.js"
import { imageProcessingRequestSchema, type ImageProcessingRequest } from "./imageProcessingRequestSchema.js"
import type { ImageProcessingOutput } from "./imageProcessingOutput.js"
import type { AiLabelOptions } from "../metadata/aiLabelOptionsSchema.js"

const defaultQuality = 80
const defaultAiLabelHeight = 40

export const imageProcess = async (
  input: ImageProcessingRequest,
  adapter: ImageProcessingAdapter = imageProcessDefault,
): Promise<Result<ImageProcessingOutput>> => {
  const op = "imageProcess"
  const parsed = v.safeParse(imageProcessingRequestSchema, input)
  if (!parsed.success) {
    return resultErrorCreate(op, v.summarize(parsed.issues), input)
  }

  try {
    return await adapter(parsed.output)
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}

const imageProcessDefault: ImageProcessingAdapter = async (request) => {
  const op = "imageProcess"
  const format = request.format ?? "avif"
  const quality = request.quality ?? defaultQuality
  const aiProvenance = request.aiProvenance ?? null
  const aiLabelOptions = request.aiLabelOptions ?? {}
  const showAiLabel = request.showAiLabel ?? aiLabelOptions.showAiLabel

  try {
    let pipeline = sharp(Buffer.from(request.sourceBytes), { animated: false }).rotate().resize({
      width: request.width,
      height: request.height,
      fit: "inside",
      withoutEnlargement: true,
    })

    if (aiProvenance !== null && showAiLabel !== false) {
      const resized = await pipeline.png().toBuffer({ resolveWithObject: true })
      const labelOptions = resolveAiLabelOptions(aiLabelOptions)
      const labelColor =
        labelOptions.mode === "adaptive"
          ? await resolveAiLabelColor(resized.data, labelOptions, resized.info.width, resized.info.height)
          : labelOptions.simpleColor
      const labelAsset = createAiLabelSvg(aiProvenance, labelOptions, labelColor)
      const labelMetadata = await sharp(labelAsset, { animated: false }).metadata()
      const geometry = resolveAiLabelGeometry(
        labelOptions,
        { width: resized.info.width, height: resized.info.height },
        { width: labelMetadata.width ?? 0, height: labelMetadata.height ?? 0 },
      )

      pipeline = sharp(resized.data, { animated: false })
      if (geometry.width > 0 && geometry.height > 0) {
        const labelWidth = Math.min(resized.info.width, Math.max(1, Math.round(geometry.width)))
        const labelHeight = Math.min(resized.info.height, Math.max(1, Math.round(geometry.height)))
        const left = clamp(Math.round(geometry.x), 0, resized.info.width - labelWidth)
        const top = clamp(Math.round(geometry.y), 0, resized.info.height - labelHeight)
        const resizedLabel = await sharp(labelAsset, { animated: false })
          .resize({ width: labelWidth, height: labelHeight, fit: "fill" })
          .png()
          .toBuffer()
        pipeline = pipeline.composite([{ input: resizedLabel, left, top }])
      }
    }

    pipeline = encodeImage(pipeline, format, quality)
    const encoded = await pipeline.toBuffer()
    const metadata = await sharp(encoded, { animated: false }).metadata()
    const outputMetadata = {
      kind: "image" as const,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      format: format,
      colorSpace: metadata.space ?? "srgb",
      alpha: metadata.hasAlpha ?? false,
      orientationApplied: true,
      frameCount: metadata.pages ?? 1,
      animated: (metadata.pages ?? 1) > 1,
      alt: request.alt ?? null,
      aiProvenance,
      ...(showAiLabel === undefined ? {} : { showAiLabel }),
    }
    const parsedMetadata = v.safeParse(imageMetadataSchema, outputMetadata)
    if (!parsedMetadata.success) {
      return resultErrorCreate(op, v.summarize(parsedMetadata.issues), outputMetadata)
    }

    return {
      success: true,
      data: {
        bytes: new Uint8Array(encoded),
        metadata: parsedMetadata.output,
        provenance: {
          schemaVersion: "assets-service.processing.v1",
          toolchain: [{ name: "sharp", version: sharp.versions.sharp }],
        },
      },
    }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}

function encodeImage(pipeline: Sharp, format: ImageProcessingRequest["format"], quality: number): Sharp {
  switch (format ?? "avif") {
    case "jpg":
      return pipeline.jpeg({ quality })
    case "png":
      return pipeline.png({ quality: 100 })
    case "webp":
      return pipeline.webp({ quality })
    case "avif":
      return pipeline.avif({ quality })
  }
}

type ResolvedAiLabelOptions = {
  mode: "simple" | "adaptive"
  simpleColor: "black" | "white"
  visual: "padding" | "circle"
  opacity: "opaque" | "50%"
  placement: "top-left" | "top-right" | "bottom-left" | "bottom-right"
  height: number
  offsetX: number
  offsetY: number
  labelText?: string
}

function resolveAiLabelOptions(options: AiLabelOptions): ResolvedAiLabelOptions {
  return {
    mode: options.mode ?? "simple",
    simpleColor: options.simpleColor ?? "black",
    visual: options.visual ?? "padding",
    opacity: options.opacity ?? "opaque",
    placement: options.placement ?? "bottom-right",
    height: options.height ?? options.labelHeight ?? defaultAiLabelHeight,
    offsetX: options.offsetX ?? 0,
    offsetY: options.offsetY ?? 0,
    ...(options.labelText === undefined ? {} : { labelText: options.labelText }),
  }
}

function createAiLabelSvg(
  provenance: "generated" | "enhanced",
  options: ResolvedAiLabelOptions,
  color: "black" | "white",
): Buffer {
  const text = options.labelText ?? (provenance === "generated" ? "AI generated" : "AI modified")
  const width = options.visual === "circle" ? 365.49 : provenance === "generated" ? 1384.24 : 1230.56
  const height = options.visual === "circle" ? 365.49 : 266.41
  const opacity = options.opacity === "opaque" ? 1 : 0.5
  const fill = color === "black" ? "#000" : "#fff"
  const textFill = color === "black" ? "#fff" : "#000"
  const shape =
    options.visual === "circle"
      ? `<circle cx="${width / 2}" cy="${height / 2}" r="${width / 2}" fill="${fill}" fill-opacity="${opacity}"/>`
      : `<rect width="${width}" height="${height}" rx="${height / 2}" fill="${fill}" fill-opacity="${opacity}"/>`
  const fontSize = options.visual === "circle" ? width * 0.16 : height * 0.42
  const textX = width / 2
  const textY = height / 2 + fontSize * 0.35
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${shape}<text x="${textX}" y="${textY}" fill="${textFill}" font-family="sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle">${escapeXml(text)}</text></svg>`
  return Buffer.from(svg)
}

async function resolveAiLabelColor(
  image: Buffer,
  options: ResolvedAiLabelOptions,
  width: number,
  height: number,
): Promise<"black" | "white"> {
  const labelWidth = Math.min(width, Math.max(1, options.height * 5))
  const labelHeight = Math.min(height, Math.max(1, options.height))
  const x = options.placement.endsWith("right") ? width - labelWidth - options.offsetX : options.offsetX
  const y = options.placement.startsWith("bottom") ? height - labelHeight - options.offsetY : options.offsetY
  const left = clamp(Math.round(x), 0, width - labelWidth)
  const top = clamp(Math.round(y), 0, height - labelHeight)
  const { data, info } = await sharp(image, { animated: false })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let luminanceTotal = 0
  let weightTotal = 0
  for (let currentY = top; currentY < top + labelHeight; currentY += 1) {
    for (let currentX = left; currentX < left + labelWidth; currentX += 1) {
      const offset = (currentY * info.width + currentX) * info.channels
      const alpha = (data[offset + info.channels - 1] ?? 0) / 255
      const red = toLinear((data[offset] ?? 0) / 255)
      const green = toLinear((data[offset + 1] ?? 0) / 255)
      const blue = toLinear((data[offset + 2] ?? 0) / 255)
      const weight = alpha
      luminanceTotal += (0.2126 * red + 0.7152 * green + 0.0722 * blue) * weight
      weightTotal += weight
    }
  }
  if (weightTotal === 0) {
    return "black"
  }
  return luminanceTotal / weightTotal <= 0.5 ? "black" : "white"
}

function resolveAiLabelGeometry(
  options: Pick<ResolvedAiLabelOptions, "placement" | "height" | "offsetX" | "offsetY">,
  image: { width: number; height: number },
  svg: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  if (image.width <= 0 || image.height <= 0 || svg.width <= 0 || svg.height <= 0 || options.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const scale = Math.min(options.height / svg.height, image.width / svg.width, image.height / svg.height)
  const width = svg.width * scale
  const height = svg.height * scale
  const x = clamp(
    options.placement.endsWith("right") ? image.width - width - options.offsetX : options.offsetX,
    0,
    image.width - width,
  )
  const y = clamp(
    options.placement.startsWith("bottom") ? image.height - height - options.offsetY : options.offsetY,
    0,
    image.height - height,
  )
  return { x, y, width, height }
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function toLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
