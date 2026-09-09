import { describe, expect, test } from "bun:test"
import { uiAssetIdFromPathnameRead } from "../src/ui/shell/uiAssetIdFromPathnameRead.js"

describe("uiAssetIdFromPathnameRead", () => {
  test("extracts asset identifier from admin asset route", () => {
    expect(uiAssetIdFromPathnameRead("/projects/demo/admin/assets/asset-123")).toBe("asset-123")
  })

  test("extracts asset identifier from contributor asset route", () => {
    expect(uiAssetIdFromPathnameRead("/projects/demo/contributor/assets/asset-456")).toBe("asset-456")
  })

  test("extracts asset identifier from legacy asset route", () => {
    expect(uiAssetIdFromPathnameRead("/projects/demo/assets/asset-789")).toBe("asset-789")
  })

  test("decodes URI-encoded asset identifiers", () => {
    expect(uiAssetIdFromPathnameRead("/projects/demo/admin/assets/my%20cool%20asset.png")).toBe("my cool asset.png")
  })

  test("returns undefined for asset list and other non-detail routes", () => {
    expect(uiAssetIdFromPathnameRead("/projects/demo/admin/assets")).toBeUndefined()
    expect(uiAssetIdFromPathnameRead("/projects/demo/contributor/assets")).toBeUndefined()
    expect(uiAssetIdFromPathnameRead("/projects/demo/admin/upload")).toBeUndefined()
    expect(uiAssetIdFromPathnameRead("/projects/demo/contributor")).toBeUndefined()
    expect(uiAssetIdFromPathnameRead("/projects/demo")).toBeUndefined()
    expect(uiAssetIdFromPathnameRead("/login")).toBeUndefined()
    expect(uiAssetIdFromPathnameRead("/")).toBeUndefined()
  })
})
