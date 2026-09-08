import { mdiCloudUpload } from "@adaptive-ds/mdi/mdiCloudUpload.js"
import type { JSXElement } from "solid-js"
import { Show } from "solid-js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { uiUploadDropAreaStateCreate } from "./uiUploadDropAreaStateCreate.js"

export type UiUploadDropAreaProps = {
  inputId: string
  testId: string
  accept: string
  disabled: boolean
  multiple?: boolean
  size?: "sm" | "lg"
  title: string
  hint?: JSXElement
  hintId?: string
  describedBy?: string
  invalid?: boolean
  filesSelect: (files: File[]) => void
}

/** Click-or-drop file chooser shared by the upload page and the replacement upload. */
export function UiUploadDropArea(p: UiUploadDropAreaProps) {
  const dropArea = uiUploadDropAreaStateCreate({
    disabled: () => p.disabled,
    fileSelect: (file) => p.filesSelect(file === null ? [] : [file]),
    filesSelect: (files) => p.filesSelect(files),
  })

  return (
    <label
      data-testid={p.testId}
      data-drag-over={dropArea.isDragOver() ? "true" : "false"}
      class={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors focus-within:ring-2 focus-within:ring-blue-500 ${
        p.size === "lg" ? "p-10 sm:p-16" : "p-6"
      } ${
        dropArea.isDragOver()
          ? "border-blue-500 bg-blue-50/70 dark:border-blue-400 dark:bg-blue-950/40"
          : "border-slate-300 bg-slate-50/50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/30 dark:hover:bg-slate-800/50"
      }`}
      for={p.inputId}
      onDragEnter={dropArea.dragOver}
      onDragOver={dropArea.dragOver}
      onDragLeave={dropArea.dragLeave}
      onDrop={dropArea.drop}
    >
      <Icon
        path={mdiCloudUpload}
        class={`text-slate-500 dark:text-slate-400 ${p.size === "lg" ? "size-12" : "size-7"}`}
      />
      <span
        class={`font-medium text-slate-800 dark:text-slate-200 ${p.size === "lg" ? "text-base sm:text-lg" : "text-sm"}`}
      >
        {p.title}
      </span>
      <input
        id={p.inputId}
        class="sr-only"
        type="file"
        multiple={p.multiple === true}
        accept={p.accept}
        disabled={p.disabled}
        aria-describedby={p.describedBy}
        aria-invalid={p.invalid === true}
        onChange={dropArea.inputChange}
      />
      <Show when={p.hint}>
        <span id={p.hintId} class="text-xs text-muted-foreground">
          {p.hint}
        </span>
      </Show>
    </label>
  )
}
