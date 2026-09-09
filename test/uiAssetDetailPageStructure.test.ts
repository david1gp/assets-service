import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

const pageSource = await readFile("src/ui/pages/UiAssetDetailPage.tsx", "utf8")
const uploadSource = await readFile("src/ui/pages/UiAssetDetailReplacementUpload.tsx", "utf8")
const dropAreaSource = await readFile("src/ui/upload/UiUploadDropArea.tsx", "utf8")
const progressBarSource = await readFile("src/ui/upload/UiUploadProgressBar.tsx", "utf8")

describe("asset detail page structure", () => {
  test("renders the replacement upload wired to the replacement state", () => {
    expect(pageSource).toContain("<UiAssetDetailReplacementUpload upload={state.replacementUpload} />")
  })

  test("collapses Metadata JSON in a Details disclosure without open", () => {
    expect(pageSource).toContain('<Details title={ttc("Metadata JSON", "Metadaten-JSON")}')
    expect(pageSource).not.toMatch(/<Details[^>]*\sopen/)
  })

  test("shows Edit outputs as the filled primary action", () => {
    const editOutputs = pageSource.slice(0, pageSource.indexOf("Edit outputs"))
    const action = editOutputs.slice(editOutputs.lastIndexOf("<ButtonIcon"))
    expect(action).toContain("icon={mdiTune}")
    expect(action).toContain('variant="filled"')
    expect(action).not.toContain('variant="outline"')
  })

  test("renders usage-note editor bound to state with explicit save", () => {
    expect(pageSource).toContain("state.integrationNoteSubmit")
    expect(pageSource).toContain("valueSignal={state.integrationNoteDraft}")
    expect(pageSource).toContain('ttc("Usage note", "Hinweis zur Verwendung")')
    expect(pageSource).toContain('ttc("Save usage note", "Hinweis speichern")')
    expect(pageSource).not.toContain("<Show when={asset.integrationNote}>")
  })
})

describe("replacement upload area structure", () => {
  test("supports click selection and native drop on the same area", () => {
    expect(dropAreaSource).toContain('type="file"')
    expect(dropAreaSource).toContain("onDrop={dropArea.drop}")
    expect(dropAreaSource).toContain("onDragOver={dropArea.dragOver}")
    expect(dropAreaSource).toContain("for={p.inputId}")
    expect(uploadSource).toContain('inputId="replacement-file"')
  })

  test("exposes accessible validation, progress, and status regions", () => {
    expect(progressBarSource).toContain('role="progressbar"')
    expect(progressBarSource).toContain("aria-labelledby={p.labelId}")
    expect(uploadSource).toContain('labelId="replacement-progress-label"')
    expect(dropAreaSource).toContain("aria-invalid={p.invalid === true}")
    expect(uploadSource).toContain("invalid={props.upload.fileError() !== null}")
    expect(uploadSource).toContain('role="alert"')
  })

  test("offers submit and reset actions bound to the upload state", () => {
    expect(uploadSource).toContain('type="submit"')
    expect(uploadSource).toContain("disabled={!props.upload.canSubmit()}")
    expect(uploadSource).toContain("onClick={props.upload.reset}")
  })
})
