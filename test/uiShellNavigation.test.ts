import { describe, expect, test } from "bun:test"

import { uiNavigationActiveCheck } from "../src/ui/shell/uiNavigationActiveCheck.js"
import { uiProjectIdFromPathnameRead } from "../src/ui/shell/uiProjectIdFromPathnameRead.js"

describe("uiNavigationActiveCheck", () => {
  test("matches exact routes", () => {
    expect(uiNavigationActiveCheck("/", "/")).toBe(true)
    expect(uiNavigationActiveCheck("/projects/demo/assets", "/projects/demo/assets")).toBe(true)
    expect(uiNavigationActiveCheck("/projects/demo/upload", "/projects/demo/upload")).toBe(true)
  })

  test("matches nested sub-routes under a section", () => {
    expect(uiNavigationActiveCheck("/projects/demo/assets/asset-1", "/projects/demo/assets")).toBe(true)
    expect(uiNavigationActiveCheck("/projects/demo/assets/asset-1/edit", "/projects/demo/assets")).toBe(true)
  })

  test("does not match different sections with similar prefixes", () => {
    expect(uiNavigationActiveCheck("/projects/demo/assets-extended", "/projects/demo/assets")).toBe(false)
    expect(uiNavigationActiveCheck("/projects/demo/upload", "/projects/demo/assets")).toBe(false)
    expect(uiNavigationActiveCheck("/projects/demo/jobs", "/projects/demo/assets")).toBe(false)
  })

  test("root does not match arbitrary nested paths", () => {
    expect(uiNavigationActiveCheck("/projects/demo/assets", "/")).toBe(false)
  })
})

describe("uiProjectIdFromPathnameRead", () => {
  test("extracts project id from project routes", () => {
    expect(uiProjectIdFromPathnameRead("/projects/demo")).toBe("demo")
    expect(uiProjectIdFromPathnameRead("/projects/demo/assets")).toBe("demo")
    expect(uiProjectIdFromPathnameRead("/projects/demo/assets/asset-123")).toBe("demo")
  })

  test("decodes URI-encoded project identifiers", () => {
    expect(uiProjectIdFromPathnameRead("/projects/my%20cool%20project/assets")).toBe("my cool project")
  })

  test("returns undefined for non-project routes", () => {
    expect(uiProjectIdFromPathnameRead("/")).toBeUndefined()
    expect(uiProjectIdFromPathnameRead("/login")).toBeUndefined()
    expect(uiProjectIdFromPathnameRead("/about")).toBeUndefined()
  })
})
