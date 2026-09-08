import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

const pageSource = await readFile("src/ui/pages/UiUploadPage.tsx", "utf8")
const cardSource = await readFile("src/ui/pages/UiUploadFileCard.tsx", "utf8")
const stateSource = await readFile("src/ui/pages/uiUploadPageStateCreate.ts", "utf8")

describe("upload page structure", () => {
  test("offers one large multi-file drop area that uploads immediately", () => {
    expect(pageSource).toContain("<UiUploadDropArea")
    expect(pageSource).toContain("multiple")
    expect(pageSource).toContain('size="lg"')
    expect(pageSource).toContain("filesSelect={(files) => state.selectFiles(files)}")
  })

  test("drives the page through the shared multi-file upload state", () => {
    expect(stateSource).toContain("uiUploadMultiFileStateCreate")
    expect(stateSource).toContain("files: uploads.files")
    expect(stateSource).toContain("folderOptions: uploads.folderOptions")
  })

  test("lists every selected file with its own card", () => {
    expect(pageSource).toContain("<For each={state.files()}>")
    expect(pageSource).toContain("<UiUploadFileCard")
  })

  test("keeps no caption or integration-note controls", () => {
    expect(pageSource).not.toContain("integrationNote")
    expect(cardSource).not.toContain("integrationNote")
    expect(pageSource).not.toContain("Textarea")
    expect(pageSource).not.toContain("caption")
  })
})

describe("upload file card structure", () => {
  test("shows per-file progress, completion, and error states", () => {
    expect(cardSource).toContain("<UiUploadProgressBar")
    expect(cardSource).toContain("percent={p.file.progress.percent}")
    expect(cardSource).toContain("hasFailed={hasFailed()}")
    expect(cardSource).toContain('const hasFailed = () => p.file.stage === "failed"')
    expect(cardSource).toContain("<Show when={p.file.errorMessage}>")
    expect(cardSource).toContain('role="alert"')
    expect(cardSource).toContain('ttc("Completed", "Abgeschlossen")')
  })

  test("edits canonical folders only after the upload completed", () => {
    const fieldset = cardSource.slice(cardSource.indexOf("<Show when={isDone()}>"))
    expect(fieldset).toContain("<UiUploadFolderInput")
    expect(fieldset).toContain("valueSet={(value) => p.folderSet(p.file.id, 1, value)}")
  })

  test("reveals level 2 only with level 1 and level 3 only with level 2", () => {
    expect(cardSource).toContain('<Show when={level1() !== ""}>')
    expect(cardSource).toContain('<Show when={level1() !== "" && level2() !== ""}>')
  })

  test("suggests folder options per level from existing canonical folders", () => {
    expect(cardSource).toContain("options={() => p.folderOptions(1)}")
    expect(cardSource).toContain("options={() => p.folderOptions(2, level1())}")
    expect(cardSource).toContain("options={() => p.folderOptions(3, level1(), level2())}")
  })
})

describe("upload folder input structure", () => {
  test("uses a native datalist for suggestions", async () => {
    const source = await readFile("src/ui/upload/UiUploadFolderInput.tsx", "utf8")
    expect(source).toContain("list={listId()}")
    expect(source).toContain("<datalist id={listId()}>")
    expect(source).toContain("<For each={p.options()}>")
  })
})
