import { expect, test } from "bun:test"
import { Window } from "happy-dom"

// The drop area must work against a real DOM: click selection goes through a
// native file input, and drop selection reads `event.dataTransfer`. A source
// assertion cannot catch a missing `preventDefault` or a wrong file read.
const window = new Window({ url: "http://localhost" })
const globals = globalThis as unknown as Record<string, unknown>
globals.window = window
globals.document = window.document
for (const key of [
  "HTMLElement",
  "HTMLInputElement",
  "Node",
  "MutationObserver",
  "Element",
  "CustomEvent",
  "Event",
  "DocumentFragment",
  "getComputedStyle",
  "requestAnimationFrame",
  "navigator",
  "DOMRect",
  "NodeFilter",
  "AbortController",
]) {
  const value = (window as unknown as Record<string, unknown>)[key]
  if (value !== undefined) globals[key] = value
}

const { createRoot } = await import("solid-js")
const { uiUploadDropAreaStateCreate } = await import("../src/ui/upload/uiUploadDropAreaStateCreate.js")
const { uiUploadDropFileRead } = await import("../src/ui/upload/uiUploadDropFileRead.js")

const fileCreate = (name: string) => new window.File(["x"], name, { type: "image/png" }) as unknown as File

const dropEventCreate = (type: "dragover" | "dragleave" | "drop", files: File[]) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, "dataTransfer", {
    value: {
      dropEffect: "none",
      files: { item: (index: number) => files[index] ?? null, length: files.length },
      items: files.map((file) => ({ kind: "file", getAsFile: () => file })),
    },
  })
  return event as unknown as DragEvent
}

/** happy-dom's `dispatchEvent` expects its own `Event` class, so the cast stays in one place. */
const eventDispatch = (target: unknown, event: DragEvent) =>
  (target as { dispatchEvent: (event: never) => boolean }).dispatchEvent(event as never)

const dropAreaMount = (disabled = false) => {
  const area = window.document.createElement("div")
  window.document.body.appendChild(area)
  const selected: Array<File | null> = []
  const dispose = createRoot((disposeRoot) => {
    const state = uiUploadDropAreaStateCreate({
      disabled: () => disabled,
      fileSelect: (file) => selected.push(file),
    })
    area.addEventListener("dragover", (event) => state.dragOver(event as unknown as DragEvent))
    area.addEventListener("dragleave", (event) => state.dragLeave(event as unknown as DragEvent))
    area.addEventListener("drop", (event) => state.drop(event as unknown as DragEvent))
    return { dispose: disposeRoot, state }
  })
  return { area, selected, ...dispose }
}

test("selects the dropped file and cancels the browser default navigation", () => {
  const { area, selected, state, dispose } = dropAreaMount()
  const file = fileCreate("replacement.png")

  const dropEvent = dropEventCreate("drop", [file])
  eventDispatch(area, dropEvent)

  expect(selected).toEqual([file])
  expect(dropEvent.defaultPrevented).toBe(true)
  expect(state.isDragOver()).toBe(false)

  dispose()
  area.remove()
})

test("highlights the area while dragging and clears the highlight on leave", () => {
  const { area, state, dispose } = dropAreaMount()

  eventDispatch(area, dropEventCreate("dragover", [fileCreate("a.png")]))
  expect(state.isDragOver()).toBe(true)

  eventDispatch(area, dropEventCreate("dragleave", []))
  expect(state.isDragOver()).toBe(false)

  dispose()
  area.remove()
})

test("ignores drops while an upload is busy so no default navigation is cancelled twice", () => {
  const { area, selected, state, dispose } = dropAreaMount(true)

  const dropEvent = dropEventCreate("drop", [fileCreate("a.png")])
  eventDispatch(area, dropEvent)
  eventDispatch(area, dropEventCreate("dragover", [fileCreate("a.png")]))

  expect(selected).toEqual([])
  expect(dropEvent.defaultPrevented).toBe(false)
  expect(state.isDragOver()).toBe(false)

  dispose()
  area.remove()
})

test("selects the file chosen through the native file input", () => {
  const { selected, state, dispose } = dropAreaMount()
  const file = fileCreate("picked.png")
  const input = { files: { item: (index: number) => (index === 0 ? file : null) } } as unknown as HTMLInputElement

  state.inputChange({ currentTarget: input })
  expect(selected).toEqual([file])

  dispose()
})

test("ignores drags that carry no file, such as text selections", () => {
  expect(uiUploadDropFileRead(null)).toBe(null)
  expect(
    uiUploadDropFileRead({
      files: { item: () => null, length: 0 },
      items: [{ kind: "string", getAsFile: () => null }],
    } as unknown as DataTransfer),
  ).toBe(null)
})
