import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { uiUploadDropFilesRead } from "./uiUploadDropFilesRead.js"

/** Drives the drag highlight and file selection of an upload drop area. */
export const uiUploadDropAreaStateCreate = (input: {
  disabled: () => boolean
  fileSelect: (file: File | null) => void
  filesSelect?: (files: File[]) => void
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
    const files = uiUploadDropFilesRead(event.dataTransfer)
    if (files.length === 0) return
    if (input.filesSelect) return input.filesSelect(files)
    input.fileSelect(files[0] ?? null)
  }

  return {
    isDragOver: isDragOver.get,
    dragOver,
    dragLeave,
    drop,
    inputChange: (event: { currentTarget: HTMLInputElement }) => {
      const files: File[] = []
      const selected = event.currentTarget.files
      const length = selected?.length ?? (selected ? 1 : 0)
      for (let index = 0; index < length; index += 1) {
        const file = selected?.item(index)
        if (file) files.push(file)
      }
      if (input.filesSelect) input.filesSelect(files)
      else input.fileSelect(files[0] ?? null)
      event.currentTarget.value = ""
    },
  }
}
