import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

const pageSource = await readFile("src/ui/pages/UiAssetDetailPage.tsx", "utf8")
const uploadSource = await readFile("src/ui/pages/UiAssetDetailReplacementUpload.tsx", "utf8")

describe("asset detail page structure", () => {
  test("renders the replacement upload wired to the replacement state", () => {
    expect(pageSource).toContain("<UiAssetDetailReplacementUpload upload={state.replacementUpload} />")
  })

  test("collapses Metadata JSON in a Details disclosure without open", () => {
    expect(pageSource).toContain('<Details title="Metadata JSON"')
    expect(pageSource).not.toMatch(/<Details[^>]*\sopen/)
  })

  test("shows Edit outputs as the filled primary action", () => {
    const editOutputs = pageSource.slice(0, pageSource.indexOf("Edit outputs"))
    const action = editOutputs.slice(editOutputs.lastIndexOf("<ButtonIcon"))
    expect(action).toContain("icon={mdiTune}")
    expect(action).toContain('variant="filled"')
    expect(action).not.toContain('variant="outline"')
  })
})

describe("replacement upload area structure", () => {
  test("supports click selection and native drop on the same area", () => {
    expect(uploadSource).toContain('type="file"')
    expect(uploadSource).toContain("onDrop={dropArea.drop}")
    expect(uploadSource).toContain("onDragOver={dropArea.dragOver}")
    expect(uploadSource).toContain('for="replacement-file"')
  })

  test("exposes accessible validation, progress, and status regions", () => {
    expect(uploadSource).toContain('role="progressbar"')
    expect(uploadSource).toContain('aria-labelledby="replacement-progress-label"')
    expect(uploadSource).toContain("aria-invalid={props.upload.fileError() !== null}")
    expect(uploadSource).toContain('role="alert"')
  })

  test("offers submit and reset actions bound to the upload state", () => {
    expect(uploadSource).toContain('type="submit"')
    expect(uploadSource).toContain("disabled={!props.upload.canSubmit()}")
    expect(uploadSource).toContain("onClick={props.upload.reset}")
  })
})
