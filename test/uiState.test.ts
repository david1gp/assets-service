import { describe, expect, test } from "bun:test"

import type { AssetListItem } from "../src/api-client/assetListItemSchema.js"
import { uiAssetPathFormat } from "../src/ui/common/uiAssetPathFormat.js"
import { uiAssetPreviewImageStateCreate } from "../src/ui/common/uiAssetPreviewImageStateCreate.js"
import { uiByteSizeFormat } from "../src/ui/common/uiByteSizeFormat.js"
import { languageSignal } from "../src/ui/localization/languageSignal.js"
import { uiAssetClassOptions } from "../src/ui/pages/uiAssetClassOptions.js"
import { uiAssetPreviewSourceRead } from "../src/ui/pages/uiAssetPreviewSourceRead.js"
import { uiSourceRevisionLatestImageRead } from "../src/ui/pages/uiSourceRevisionLatestImageRead.js"
import { uiPaths } from "../src/ui/routing/uiPaths.js"
import { uiSearchParamNumberRead } from "../src/ui/search/uiSearchParamNumberRead.js"
import { uiSearchParamStringRead } from "../src/ui/search/uiSearchParamStringRead.js"
import { uiUploadFoldersRead } from "../src/ui/upload/uiUploadFoldersRead.js"
import { uiUploadStageProgressRead } from "../src/ui/upload/uiUploadStageProgressRead.js"
import { uiUploadStatusLabelRead } from "../src/ui/upload/uiUploadStatusLabelRead.js"
import { uiWorkflowStatusLabelRead } from "../src/ui/workflow/uiWorkflowStatusLabelRead.js"

describe("uiUploadFoldersRead", () => {
  test("accepts zero to three folders", () => {
    expect(uiUploadFoldersRead(["", "", ""])).toEqual({ success: true, data: [] })
    expect(uiUploadFoldersRead(["brand", "", ""])).toEqual({ success: true, data: ["brand"] })
    expect(uiUploadFoldersRead([" brand ", "logos", "dark"])).toEqual({
      success: true,
      data: ["brand", "logos", "dark"],
    })
  })

  test("rejects a gap between folder levels", () => {
    const result = uiUploadFoldersRead(["", "logos", ""])
    expect(result.success).toBe(false)
  })

  test("rejects a folder containing a separator", () => {
    const result = uiUploadFoldersRead(["brand/logos", "", ""])
    expect(result.success).toBe(false)
  })
})

describe("uiUploadStageProgressRead", () => {
  test("increases monotonically through the upload stages", () => {
    const stages = ["idle", "hashing", "requesting", "transferring", "completing", "done"] as const
    const percents = stages.map((stage) => uiUploadStageProgressRead(stage).percent)
    expect(percents).toEqual([...percents].sort((a, b) => a - b))
    expect(percents.at(-1)).toBe(100)
  })

  test("labels a failed upload", () => {
    languageSignal.set("en")
    expect(uiUploadStageProgressRead("failed").label).toBe("Upload failed")
  })
})

test("localizes upload and workflow status labels while preserving unknown values", () => {
  languageSignal.set("de")
  try {
    expect(uiUploadStatusLabelRead("accepted")).toBe("angenommen")
    expect(uiWorkflowStatusLabelRead("dead")).toBe("endgültig fehlgeschlagen")
    expect(uiWorkflowStatusLabelRead("backend-status")).toBe("backend-status")
  } finally {
    languageSignal.set("en")
  }
})

describe("uiSearchParamStringRead", () => {
  test("drops blank and missing values", () => {
    expect(uiSearchParamStringRead(undefined)).toBeUndefined()
    expect(uiSearchParamStringRead("   ")).toBeUndefined()
    expect(uiSearchParamStringRead(" logo ")).toBe("logo")
    expect(uiSearchParamStringRead(["first", "second"])).toBe("first")
  })
})

describe("uiSearchParamNumberRead", () => {
  test("only accepts non-negative integers", () => {
    expect(uiSearchParamNumberRead("25")).toBe(25)
    expect(uiSearchParamNumberRead("-1")).toBeUndefined()
    expect(uiSearchParamNumberRead("2.5")).toBeUndefined()
    expect(uiSearchParamNumberRead("abc")).toBeUndefined()
  })
})

describe("uiAssetPathFormat", () => {
  test("joins folders and filename", () => {
    expect(uiAssetPathFormat(["brand", "logos"], "mark.svg")).toBe("brand/logos/mark.svg")
    expect(uiAssetPathFormat([], "mark.svg")).toBe("mark.svg")
  })
})

describe("uiByteSizeFormat", () => {
  test("scales to readable units", () => {
    expect(uiByteSizeFormat(512)).toBe("512 B")
    expect(uiByteSizeFormat(2_400)).toBe("2.4 kB")
    expect(uiByteSizeFormat(15_000_000)).toBe("15 MB")
  })
})

describe("uiPaths", () => {
  test("encodes identifiers for deep links", () => {
    expect(uiPaths.asset("p 1", "a/1")).toBe("/projects/p%201/assets/a%2F1")
  })
})

describe("uiAssetClassOptions", () => {
  test("includes all, image, video, font, and document classes", () => {
    expect(uiAssetClassOptions).toEqual(["all", "image", "video", "font", "document"])
  })
})

describe("uiSourceRevisionLatestImageRead", () => {
  test("returns the highest-numbered image revision regardless of input order", () => {
    const revisions = [
      { revision: 2, mediaType: "image/webp", id: "source-2" },
      { revision: 1, mediaType: "image/jpeg", id: "source-1" },
    ]

    expect(uiSourceRevisionLatestImageRead(revisions)?.id).toBe("source-2")
  })

  test("does not preview an older image when the latest revision is not an image", () => {
    expect(
      uiSourceRevisionLatestImageRead([
        { revision: 1, mediaType: "image/jpeg" },
        { revision: 2, mediaType: "application/pdf" },
      ]),
    ).toBeNull()
  })

  test("only previews allowlisted raster media types", () => {
    for (const mediaType of ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]) {
      expect(uiSourceRevisionLatestImageRead([{ revision: 1, mediaType }])).not.toBeNull()
    }
    for (const mediaType of ["image/svg+xml", "image/tiff", "video/mp4"]) {
      expect(uiSourceRevisionLatestImageRead([{ revision: 1, mediaType }])).toBeNull()
    }
  })

  test("returns null without source revisions", () => {
    expect(uiSourceRevisionLatestImageRead([])).toBeNull()
  })
})

describe("uiAssetPreviewSourceRead", () => {
  const assetCreate = (overrides: Record<string, unknown> = {}) =>
    ({ class: "image", filename: "hero.jpg", ...overrides }) as unknown as AssetListItem
  const options = {
    outputVersionUrlCreate: (id: string) => `/outputs/${id}`,
    sourceRevisionPreviewUrlCreate: (id: string) => `/sources/${id}`,
  }

  test("chooses the smallest current image output regardless of input order", () => {
    const large = {
      definition: { id: "large", kind: "image", key: "1600x900", width: 1600, height: 900 },
      versions: [{ id: "large-version", current: true, mediaType: "image/webp", version: 1 }],
    }
    const small = {
      definition: { id: "small", kind: "image", key: "800x450", width: 800, height: 450 },
      versions: [{ id: "small-version", current: true, mediaType: "image/webp", version: 1 }],
    }

    expect(uiAssetPreviewSourceRead(assetCreate({ outputHistory: [large, small] }), options)).toMatchObject({
      kind: "optimized",
      url: "/outputs/small-version",
      width: 800,
      height: 450,
    })
  })

  test("ignores unsuitable outputs and falls back to the latest original image", () => {
    const asset = assetCreate({
      outputHistory: [
        {
          definition: { id: "video", kind: "video", key: "source" },
          versions: [{ id: "video-version", current: true, mediaType: "video/mp4", version: 1 }],
        },
        {
          definition: { id: "stale", kind: "image", key: "small", width: 800, height: 450 },
          versions: [{ id: "stale-version", current: false, mediaType: "image/webp", version: 1 }],
        },
      ],
      sourceHistory: [
        { id: "source-2", revision: 2, mediaType: "image/jpeg" },
        { id: "source-1", revision: 1, mediaType: "image/jpeg" },
      ],
    })

    expect(uiAssetPreviewSourceRead(asset, options)).toMatchObject({ kind: "original", url: "/sources/source-2" })
  })

  test("offers the latest original image as fallback for an optimized output", () => {
    const asset = assetCreate({
      outputHistory: [
        {
          definition: { id: "small", kind: "image", key: "800x450", width: 800, height: 450 },
          versions: [{ id: "small-version", current: true, mediaType: "image/webp", version: 1 }],
        },
      ],
      sourceHistory: [
        { id: "source-2", revision: 2, mediaType: "image/jpeg" },
        { id: "source-1", revision: 1, mediaType: "image/jpeg" },
      ],
    })

    expect(uiAssetPreviewSourceRead(asset, options)).toMatchObject({
      kind: "optimized",
      url: "/outputs/small-version",
      fallbackUrl: "/sources/source-2",
    })
  })

  test("has no fallback when the original is missing or is already the preview", () => {
    const withoutOriginal = assetCreate({
      outputHistory: [
        {
          definition: { id: "small", kind: "image", key: "800x450", width: 800, height: 450 },
          versions: [{ id: "small-version", current: true, mediaType: "image/webp", version: 1 }],
        },
      ],
      sourceHistory: [{ id: "source-1", revision: 1, mediaType: "application/pdf" }],
    })
    const originalOnly = assetCreate({
      sourceHistory: [{ id: "source-1", revision: 1, mediaType: "image/jpeg" }],
    })

    expect(uiAssetPreviewSourceRead(withoutOriginal, options)).toMatchObject({
      kind: "optimized",
      fallbackUrl: null,
    })
    expect(uiAssetPreviewSourceRead(originalOnly, options)).toMatchObject({ kind: "original", fallbackUrl: null })
  })

  test("returns no source for non-image assets or without an image original", () => {
    expect(uiAssetPreviewSourceRead(assetCreate({ class: "document" }), options)).toBeNull()
    expect(
      uiAssetPreviewSourceRead(
        assetCreate({ sourceHistory: [{ id: "source-1", revision: 1, mediaType: "application/pdf" }] }),
        options,
      ),
    ).toBeNull()
  })
})

describe("uiAssetPreviewImageStateCreate", () => {
  const optimized = {
    alt: "hero",
    fallbackUrl: "/sources/source-2",
    height: 450,
    kind: "optimized" as const,
    url: "/outputs/small-version",
    width: 800,
  }

  test("shows the optimized output with its dimensions until it fails to load", () => {
    const state = uiAssetPreviewImageStateCreate(() => optimized)

    expect(state.src()).toBe("/outputs/small-version")
    expect(state.width()).toBe(800)
    expect(state.height()).toBe(450)
  })

  test("falls back to the latest original image and drops the output dimensions", () => {
    const state = uiAssetPreviewImageStateCreate(() => optimized)

    state.loadFailed()

    expect(state.src()).toBe("/sources/source-2")
    // The original has other dimensions, so the output ones would distort it.
    expect(state.width()).toBeUndefined()
    expect(state.height()).toBeUndefined()
  })

  test("keeps the fallback when it fails too instead of looping back to the output", () => {
    const state = uiAssetPreviewImageStateCreate(() => optimized)

    state.loadFailed()
    state.loadFailed()

    expect(state.src()).toBe("/sources/source-2")
  })

  test("does not fall back without an original image", () => {
    const state = uiAssetPreviewImageStateCreate(() => ({ ...optimized, fallbackUrl: null }))

    state.loadFailed()

    expect(state.src()).toBe("/outputs/small-version")
    expect(state.width()).toBe(800)
  })

  test("resets the fallback when the preview source changes", () => {
    let source = optimized
    const state = uiAssetPreviewImageStateCreate(() => source)

    state.loadFailed()
    source = { ...optimized, url: "/outputs/other-version" }

    expect(state.src()).toBe("/outputs/other-version")
    expect(state.width()).toBe(800)
  })
})
