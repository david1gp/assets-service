import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

const landingSource = await readFile("src/ui/pages/UiContributorLandingPage.tsx", "utf8")
const listSource = await readFile("src/ui/pages/UiContributorAssetListPage.tsx", "utf8")
const detailSource = await readFile("src/ui/pages/UiContributorAssetDetailPage.tsx", "utf8")

describe("contributor pages", () => {
  test("keeps the landing page focused on the two contributor operations", () => {
    expect(landingSource).toContain("state.uploadPath()")
    expect(landingSource).toContain("state.assetsPath()")
    expect(landingSource).not.toContain("admin")
  })

  test("keeps the asset gallery customer-facing", () => {
    expect(listSource).toContain("state.previewSourceRead(asset)")
    expect(listSource).toContain("state.classLabelRead(asset)")
    expect(listSource).not.toContain("updatedDateRead")
    expect(listSource).not.toContain("Asset ID")
    expect(listSource).not.toContain("Source path")
  })

  test("offers alternative-text editing only for images", () => {
    expect(detailSource).toContain('<Show when={asset.class === "image"}>')
    expect(detailSource).toContain("state.altSubmit")
    expect(detailSource).toContain('ttc("Download file", "Datei herunterladen")')
    expect(detailSource).not.toContain("sourcePath")
    expect(detailSource).not.toContain("outputHistory")
  })
})
