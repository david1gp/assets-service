import { expect, test } from "bun:test"

import { uiProjectCardHrefRead } from "../src/ui/pages/uiProjectCardHrefRead.js"

test("opens contributor project cards at the contributor root", () => {
  expect(uiProjectCardHrefRead("project-1", "contributor")).toBe("/projects/project-1/contributor")
  expect(uiProjectCardHrefRead("project-1", "admin")).toBe("/projects/project-1/admin/assets")
  expect(uiProjectCardHrefRead("project-1", undefined)).toBe("/projects/project-1/admin/assets")
})
