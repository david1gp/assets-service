import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { uiUploadDropFileRead } from "./uiUploadDropFileRead.js"

/** Drives the drag highlight and file selection of an upload drop area. */
export const uiUploadDropAreaStateCreate = (input: {
  disabled: () => boolean
  fileSelect: (file: File | null) => void
}) => {
  const isDragOver = createSignalObject(false)

  const dragOver = (event: DragEvent) => {
    if (input.disabled()) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
    isDragOver.set(true)
  }

  const dragLeave = (event: DragEvent) => {
    const related = event.relatedTarget as Node | null
    const area = event.currentTarget as Node | null
    if (related && area && "contains" in area && area.contains(related)) return
    isDragOver.set(false)
  }

  const drop = (event: DragEvent) => {
    if (input.disabled()) return
    event.preventDefault()
    isDragOver.set(false)
    const file = uiUploadDropFileRead(event.dataTransfer)
    if (file === null) return
    input.fileSelect(file)
  }

  return {
    isDragOver: isDragOver.get,
    dragOver,
    dragLeave,
    drop,
    inputChange: (event: { currentTarget: HTMLInputElement }) => {
      input.fileSelect(event.currentTarget.files?.item(0) ?? null)
    },
  }
}
