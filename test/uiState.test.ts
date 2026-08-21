import { describe, expect, test } from "bun:test"

import { uiAssetPathFormat } from "../src/ui/common/uiAssetPathFormat.js"
import { uiByteSizeFormat } from "../src/ui/common/uiByteSizeFormat.js"
import { uiAssetClassOptions } from "../src/ui/pages/uiAssetClassOptions.js"
import { uiSourceRevisionLatestImageRead } from "../src/ui/pages/uiSourceRevisionLatestImageRead.js"
import { uiPaths } from "../src/ui/routing/uiPaths.js"
import { uiSearchParamNumberRead } from "../src/ui/search/uiSearchParamNumberRead.js"
import { uiSearchParamStringRead } from "../src/ui/search/uiSearchParamStringRead.js"
import { uiUploadFoldersRead } from "../src/ui/upload/uiUploadFoldersRead.js"
import { uiUploadStageProgressRead } from "../src/ui/upload/uiUploadStageProgressRead.js"

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
    expect(uiUploadStageProgressRead("failed").label).toBe("Upload failed")
  })
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
