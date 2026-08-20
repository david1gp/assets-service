import { describe, expect, test } from "bun:test"

import type { OutputDefinition } from "../src/output/outputDefinitionSchema.js"
import { uiOutputDraftFromDefinition } from "../src/ui/output/uiOutputDraftFromDefinition.js"
import type { UiOutputDraft } from "../src/ui/output/uiOutputDraftSchema.js"
import { uiOutputDraftsInputsRead } from "../src/ui/output/uiOutputDraftsInputsRead.js"
import { uiOutputSetChangesRead } from "../src/ui/output/uiOutputSetChangesRead.js"
import { uiRouteIsKnown } from "../src/ui/routing/uiRouteIsKnown.js"
import { uiPublicUrlFormat } from "../src/ui/common/uiPublicUrlFormat.js"

const imageDefinition: OutputDefinition = {
  id: "output-1",
  assetId: "asset-1",
  kind: "image",
  key: "1600x900_webp",
  width: 1600,
  height: 900,
  format: "webp",
  quality: 82,
  showAiLabel: true,
}

const draftCreate = (overrides: Partial<UiOutputDraft> = {}): UiOutputDraft => ({
  id: "draft-1",
  key: "1600x900_webp",
  width: "1600",
  height: "900",
  format: "webp",
  quality: "82",
  aiLabel: "on",
  ...overrides,
})

describe("uiOutputDraftFromDefinition", () => {
  test("keeps key, dimensions, format, quality, and the AI-label override", () => {
    expect(uiOutputDraftFromDefinition(imageDefinition)).toEqual({
      id: "output-1",
      key: "1600x900_webp",
      width: "1600",
      height: "900",
      format: "webp",
      quality: "82",
      aiLabel: "on",
    })
  })

  test("marks a missing AI-label override as inherited", () => {
    const { showAiLabel: _drop, ...rest } = imageDefinition
    expect(uiOutputDraftFromDefinition(rest as OutputDefinition).aiLabel).toBe("inherit")
  })
})

describe("uiOutputDraftsInputsRead", () => {
  test("builds a valid image output set", () => {
    const result = uiOutputDraftsInputsRead([draftCreate()], "image")
    expect(result).toEqual({
      success: true,
      data: [
        {
          kind: "image",
          key: "1600x900_webp",
          width: 1600,
          height: 900,
          format: "webp",
          quality: 82,
          showAiLabel: true,
        },
      ],
    })
  })

  test("omits quality and the AI-label override when they are not set", () => {
    const result = uiOutputDraftsInputsRead([draftCreate({ quality: "", aiLabel: "inherit" })], "image")
    expect(result.success && result.data[0]).toEqual({
      kind: "image",
      key: "1600x900_webp",
      width: 1600,
      height: 900,
      format: "webp",
    })
  })

  test("rejects an empty output set", () => {
    expect(uiOutputDraftsInputsRead([], "image").success).toBe(false)
  })

  test("rejects duplicate keys", () => {
    const drafts = [draftCreate(), draftCreate({ id: "draft-2" })]
    expect(uiOutputDraftsInputsRead(drafts, "image").success).toBe(false)
  })

  test("rejects a missing dimension and an out-of-range quality", () => {
    expect(uiOutputDraftsInputsRead([draftCreate({ width: "" })], "image").success).toBe(false)
    expect(uiOutputDraftsInputsRead([draftCreate({ quality: "140" })], "image").success).toBe(false)
  })

  test("builds video, font, and document sets without image fields", () => {
    expect(uiOutputDraftsInputsRead([draftCreate({ key: "source" })], "video").success).toBe(true)
    expect(uiOutputDraftsInputsRead([draftCreate({ key: "woff2" })], "font")).toEqual({
      success: true,
      data: [{ kind: "font", key: "woff2", format: "woff2" }],
    })
    expect(uiOutputDraftsInputsRead([draftCreate({ key: "default" })], "document")).toEqual({
      success: true,
      data: [{ kind: "document", key: "default" }],
    })
  })
})

describe("uiOutputSetChangesRead", () => {
  test("reports a removal as destructive", () => {
    const changes = uiOutputSetChangesRead(
      [imageDefinition, { ...imageDefinition, id: "output-2", key: "800x450_webp" }],
      [
        {
          kind: "image",
          key: "1600x900_webp",
          width: 1600,
          height: 900,
          format: "webp",
          quality: 82,
          showAiLabel: true,
        },
      ],
    )
    expect(changes.removedKeys).toEqual(["800x450_webp"])
    expect(changes.isDestructive).toBe(true)
  })

  test("reports a shape change as a rebuild", () => {
    const changes = uiOutputSetChangesRead(
      [imageDefinition],
      [
        {
          kind: "image",
          key: "1600x900_webp",
          width: 1200,
          height: 900,
          format: "webp",
          quality: 82,
          showAiLabel: true,
        },
      ],
    )
    expect(changes.rebuiltKeys).toEqual(["1600x900_webp"])
    expect(changes.isDestructive).toBe(true)
  })

  test("treats a pure addition as non-destructive", () => {
    const changes = uiOutputSetChangesRead(
      [imageDefinition],
      [
        {
          kind: "image",
          key: "1600x900_webp",
          width: 1600,
          height: 900,
          format: "webp",
          quality: 82,
          showAiLabel: true,
        },
        { kind: "image", key: "400x225_webp", width: 400, height: 225, format: "webp" },
      ],
    )
    expect(changes.addedKeys).toEqual(["400x225_webp"])
    expect(changes.isDestructive).toBe(false)
  })
})

describe("uiRouteIsKnown", () => {
  test("accepts the routes of this SPA", () => {
    expect(uiRouteIsKnown("/")).toBe(true)
    expect(uiRouteIsKnown("/login")).toBe(true)
    expect(uiRouteIsKnown("/projects/p1")).toBe(true)
    expect(uiRouteIsKnown("/projects/p1/settings")).toBe(true)
    expect(uiRouteIsKnown("/projects/p1/assets/a1")).toBe(true)
  })

  test("rejects unknown paths", () => {
    expect(uiRouteIsKnown("/nope")).toBe(false)
    expect(uiRouteIsKnown("/projects/p1/unknown")).toBe(false)
    expect(uiRouteIsKnown("/projects/p1/jobs/j1")).toBe(false)
  })
})

describe("uiPublicUrlFormat", () => {
  test("joins without duplicating the separator", () => {
    expect(uiPublicUrlFormat("https://cdn.test/", "/images/a.webp")).toBe("https://cdn.test/images/a.webp")
  })
})
