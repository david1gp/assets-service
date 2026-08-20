import { describe, expect, test } from "bun:test"
import { uiTableDesktopClassesRead } from "../src/ui/table/uiTableDesktopClassesRead.js"
import { uiTableMobileClassesRead } from "../src/ui/table/uiTableMobileClassesRead.js"

describe("uiTableDesktopClassesRead", () => {
  test("returns default desktop classes with proper cell and header padding", () => {
    const classes = uiTableDesktopClassesRead()
    expect(classes.class).toContain("w-full")
    expect(classes.header).toContain("px-4")
    expect(classes.header).toContain("py-3")
    expect(classes.data).toContain("px-4")
    expect(classes.data).toContain("py-3.5")
    expect(classes.row).toContain("border-b")
  })

  test("allows overriding desktop classes", () => {
    const classes = uiTableDesktopClassesRead({ data: "p-2" })
    expect(classes.data).toBe("p-2")
    expect(classes.header).toContain("px-4")
  })
})

describe("uiTableMobileClassesRead", () => {
  test("returns default mobile classes with card padding", () => {
    const classes = uiTableMobileClassesRead()
    expect(classes.class).toContain("p-4")
    expect(classes.entry).toContain("p-4")
    expect(classes.entry).toContain("rounded-lg")
  })

  test("allows overriding mobile classes", () => {
    const classes = uiTableMobileClassesRead({ entry: "custom-entry" })
    expect(classes.entry).toBe("custom-entry")
    expect(classes.class).toContain("p-4")
  })
})
