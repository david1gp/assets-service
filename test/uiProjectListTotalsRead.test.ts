import { describe, expect, test } from "bun:test"

import { uiProjectListTotalsRead } from "../src/ui/pages/uiProjectListTotalsRead.js"

const projectCreate = (id: string, assetCount: number, totalFileSize: number) =>
  ({
    id,
    name: id,
    slug: id,
    defaultEnvironment: "production",
    assetCount,
    totalFileSize,
  }) as unknown as Parameters<typeof uiProjectListTotalsRead>[0][number]

describe("uiProjectListTotalsRead", () => {
  test("returns zero totals for an empty list", () => {
    expect(uiProjectListTotalsRead([])).toEqual({ assetCount: 0, totalFileSize: 0 })
  })

  test("sums asset counts and file sizes of the shown projects", () => {
    const totals = uiProjectListTotalsRead([projectCreate("a", 3, 1000), projectCreate("b", 4, 2500)])
    expect(totals).toEqual({ assetCount: 7, totalFileSize: 3500 })
  })
})
