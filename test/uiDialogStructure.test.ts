import { readFile } from "node:fs/promises"

import { describe, expect, test } from "bun:test"

describe("UiDialog structure", () => {
  test("uses a non-landmark heading wrapper without removing dialog accessibility behavior", async () => {
    const source = await readFile("src/ui/common/UiDialog.tsx", "utf8")

    // A dialog portal is nested in the app shell. A semantic header becomes a
    // second banner landmark there and fails axe `landmark-no-duplicate-banner`
    // and `landmark-unique`.
    expect(source).not.toMatch(/<\/?header\b/)
    expect(source).toContain('<div class="mb-4 flex items-center justify-between gap-2">')

    // Corvu keeps the title relationship, focus trap, focus restoration, and
    // Escape handling. The app keeps its existing close control and classes.
    expect(source).toContain("<Dialog.Label")
    expect(source).toContain("<Dialog.Description")
    expect(source).toContain("<Dialog.Close")
    expect(source).toContain("classesDialogContentMerge()")
    expect(source).toContain("classesDialogOverlayMerge()")
    expect(source).toContain("onOpenChange={(open) => (open ? undefined : p.onClose())}")
  })

  test("routes the move, output, and delete dialogs through the shared structure", async () => {
    const source = await readFile("src/ui/pages/UiAssetDetailPage.tsx", "utf8")
    const titles = ["Move asset", "Edit output set", "Request deletion of this asset?"]

    expect(source.match(/<UiDialog\b/g)).toHaveLength(titles.length)
    for (const title of titles) expect(source).toContain(`title="${title}"`)
  })
})
