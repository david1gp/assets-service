import { mdiCloudUpload } from "@adaptive-ds/mdi/mdiCloudUpload.js"
import { mdiRestart } from "@adaptive-ds/mdi/mdiRestart.js"
import { Show } from "solid-js"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { classArr } from "#ui/utils/classArr.js"
import { UiNotice } from "../common/UiNotice.jsx"
import { uiByteSizeFormat } from "../common/uiByteSizeFormat.js"
import { uiUploadDropAreaStateCreate } from "../upload/uiUploadDropAreaStateCreate.js"
import type { uiAssetDetailReplacementUploadStateCreate } from "./uiAssetDetailReplacementUploadStateCreate.js"

/** Uploads a replacement source file for the current asset via click or native file drop. */
export function UiAssetDetailReplacementUpload(props: {
  upload: ReturnType<typeof uiAssetDetailReplacementUploadStateCreate>
}) {
  const dropArea = uiUploadDropAreaStateCreate({
    disabled: () => props.upload.isBusy(),
    fileSelect: (file) => props.upload.selectFile(file),
  })

  return (
    <form
      class="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void props.upload.submit()
      }}
    >
      <label
        data-testid="replacement-drop-area"
        data-drag-over={dropArea.isDragOver() ? "true" : "false"}
        class={classArr(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors focus-within:ring-2 focus-within:ring-blue-500",
          dropArea.isDragOver()
            ? "border-blue-500 bg-blue-50/70 dark:border-blue-400 dark:bg-blue-950/40"
            : "border-slate-300 bg-slate-50/50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/30 dark:hover:bg-slate-800/50",
        )}
        for="replacement-file"
        onDragEnter={dropArea.dragOver}
        onDragOver={dropArea.dragOver}
        onDragLeave={dropArea.dragLeave}
        onDrop={dropArea.drop}
      >
        <Icon path={mdiCloudUpload} class="size-7 text-slate-500 dark:text-slate-400" />
        <span class="text-sm font-medium text-slate-800 dark:text-slate-200">
          Drop a replacement file here or choose one
        </span>
        <input
          id="replacement-file"
          class="sr-only"
          type="file"
          accept={props.upload.acceptAttribute}
          disabled={props.upload.isBusy()}
          aria-describedby={props.upload.fileError() === null ? "replacement-file-hint" : "replacement-file-error"}
          aria-invalid={props.upload.fileError() !== null}
          onChange={dropArea.inputChange}
        />
        <span id="replacement-file-hint" class="text-xs text-muted-foreground">
          The replacement must resolve to the same asset class and keeps the current path.
        </span>
      </label>

      <Show when={props.upload.file.get()}>
        {(selected) => (
          <p class="text-sm text-muted-foreground" data-testid="replacement-selected-file">
            Selected: {selected().name} · {uiByteSizeFormat(selected().size)}
          </p>
        )}
      </Show>

      <Show when={props.upload.fileError()}>
        {(message) => (
          <UiNotice id="replacement-file-error" tone="negative" role="alert">
            {message()}
          </UiNotice>
        )}
      </Show>

      <div>
        <p id="replacement-progress-label" class="text-xs text-muted-foreground">
          {props.upload.progress().label}
        </p>
        <div
          role="progressbar"
          aria-labelledby="replacement-progress-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={props.upload.progress().percent}
          class="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        >
          <div
            class={classArr("h-full transition-all", props.upload.stage() === "failed" ? "bg-red-700" : "bg-blue-600")}
            style={{ width: `${props.upload.progress().percent}%` }}
          />
        </div>
      </div>

      <Show when={props.upload.errorMessage()}>
        {(message) => (
          <UiNotice tone="negative" role="alert">
            {message()}
          </UiNotice>
        )}
      </Show>

      <Show when={props.upload.stage() === "done"}>
        <UiNotice tone="positive" role="status">
          The replacement was accepted and a new source revision is queued.
        </UiNotice>
      </Show>

      <div class="flex flex-wrap gap-2">
        <ButtonIcon
          type="submit"
          size="sm"
          icon={mdiCloudUpload}
          isLoading={props.upload.isBusy()}
          disabled={!props.upload.canSubmit()}
        >
          Upload replacement
        </ButtonIcon>
        <ButtonIcon
          type="button"
          size="sm"
          variant="outline"
          icon={mdiRestart}
          disabled={props.upload.isBusy()}
          onClick={props.upload.reset}
        >
          Reset
        </ButtonIcon>
      </div>
    </form>
  )
}
