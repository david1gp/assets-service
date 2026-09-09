import { describe, expect, test } from "bun:test"
import { languageSignal } from "../src/ui/localization/languageSignal.js"
import { uiBreadcrumbPageRead } from "../src/ui/shell/uiBreadcrumbPageRead.js"

describe("uiBreadcrumbPageRead", () => {
  test("returns List for asset list routes", () => {
    expect(uiBreadcrumbPageRead("/projects/demo/admin/assets")).toBe("List")
    expect(uiBreadcrumbPageRead("/projects/demo/contributor/assets")).toBe("List")
    expect(uiBreadcrumbPageRead("/projects/demo/assets")).toBe("List")
  })

  test("returns Upload for upload routes", () => {
    expect(uiBreadcrumbPageRead("/projects/demo/admin/upload")).toBe("Upload")
    expect(uiBreadcrumbPageRead("/projects/demo/contributor/upload")).toBe("Upload")
    expect(uiBreadcrumbPageRead("/projects/demo/upload")).toBe("Upload")
  })

  test("returns asset name or falls back to decoded asset ID for detail routes", () => {
    expect(uiBreadcrumbPageRead("/projects/demo/admin/assets/asset-123")).toBe("asset-123")
    expect(uiBreadcrumbPageRead("/projects/demo/admin/assets/asset-123", "hero.png")).toBe("hero.png")
    expect(uiBreadcrumbPageRead("/projects/demo/contributor/assets/my%20asset")).toBe("my asset")
    expect(uiBreadcrumbPageRead("/projects/demo/contributor/assets/my%20asset", "photo.jpg")).toBe("photo.jpg")
  })

  test("returns section labels for other admin routes", () => {
    expect(uiBreadcrumbPageRead("/projects/demo/admin/jobs")).toBe("Jobs")
    expect(uiBreadcrumbPageRead("/projects/demo/admin/backups")).toBe("Backups")
    expect(uiBreadcrumbPageRead("/projects/demo/admin/catalog")).toBe("Catalog")
    expect(uiBreadcrumbPageRead("/projects/demo/admin/audit")).toBe("Audit")
    expect(uiBreadcrumbPageRead("/projects/demo/admin/settings")).toBe("Settings")
  })

  test("returns undefined for landing and non-subpage routes", () => {
    expect(uiBreadcrumbPageRead("/projects/demo/contributor")).toBeUndefined()
    expect(uiBreadcrumbPageRead("/projects/demo")).toBeUndefined()
    expect(uiBreadcrumbPageRead("/login")).toBeUndefined()
    expect(uiBreadcrumbPageRead("/")).toBeUndefined()
  })

  test("keeps List and Upload labels stable while translating other breadcrumbs", () => {
    languageSignal.set("de")
    try {
      expect(uiBreadcrumbPageRead("/projects/demo/admin/assets")).toBe("List")
      expect(uiBreadcrumbPageRead("/projects/demo/admin/upload")).toBe("Upload")
      expect(uiBreadcrumbPageRead("/projects/demo/admin/jobs")).toBe("Aufträge")
      expect(uiBreadcrumbPageRead("/projects/demo/admin/settings")).toBe("Einstellungen")
    } finally {
      languageSignal.set("en")
    }
  })
})
