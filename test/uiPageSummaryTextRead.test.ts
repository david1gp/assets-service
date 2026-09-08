import { expect, test } from "bun:test"

import { uiPageSummaryTextRead } from "../src/ui/common/uiPageSummaryTextRead.js"

test("reports the shown count, filtered total, and page position", () => {
  const summary = uiPageSummaryTextRead({
    shownCount: 100,
    page: { limit: 100, nextCursor: "200", total: 1234 },
    cursor: 100,
  })
  expect(summary).toBe("Showing 100 of 1,234 assets · Page 2/13")
})

test("treats a missing cursor as the first page", () => {
  const summary = uiPageSummaryTextRead({
    shownCount: 100,
    page: { limit: 100, nextCursor: "100", total: 1234 },
    cursor: undefined,
  })
  expect(summary).toBe("Showing 100 of 1,234 assets · Page 1/13")
})

test("keeps a single full page at one of one", () => {
  const summary = uiPageSummaryTextRead({
    shownCount: 7,
    page: { limit: 100, nextCursor: null, total: 7 },
    cursor: undefined,
  })
  expect(summary).toBe("Showing 7 of 7 assets · Page 1/1")
})

test("uses the singular noun for a single total", () => {
  const summary = uiPageSummaryTextRead({
    shownCount: 1,
    page: { limit: 100, nextCursor: null, total: 1 },
    cursor: undefined,
  })
  expect(summary).toBe("Showing 1 of 1 asset · Page 1/1")
})

test("omits the page position when nothing matched", () => {
  const summary = uiPageSummaryTextRead({
    shownCount: 0,
    page: { limit: 100, nextCursor: null, total: 0 },
    cursor: undefined,
  })
  expect(summary).toBe("Showing 0 assets")
})

test("falls back to the shown count when the response omits a total", () => {
  const summary = uiPageSummaryTextRead({
    shownCount: 42,
    page: { limit: 100, nextCursor: null },
    cursor: undefined,
  })
  expect(summary).toBe("Showing 42 assets")
})

test("renders nothing about pages before the first response arrives", () => {
  expect(uiPageSummaryTextRead({ shownCount: 0, page: undefined, cursor: undefined })).toBe("Showing 0 assets")
})
