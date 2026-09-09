import { mdiCloudUpload } from "@adaptive-ds/mdi/mdiCloudUpload.js"
import { mdiRestart } from "@adaptive-ds/mdi/mdiRestart.js"
import { Show } from "solid-js"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { UiNotice } from "../common/UiNotice.jsx"
import { uiByteSizeFormat } from "../common/uiByteSizeFormat.js"
import { ttc } from "../localization/ttc.js"
import { UiUploadDropArea } from "../upload/UiUploadDropArea.jsx"
import { UiUploadProgressBar } from "../upload/UiUploadProgressBar.jsx"
import type { uiAssetDetailReplacementUploadStateCreate } from "./uiAssetDetailReplacementUploadStateCreate.js"

/** Uploads a replacement source file for the current asset via click or native file drop. */
export function UiAssetDetailReplacementUpload(props: {
  upload: ReturnType<typeof uiAssetDetailReplacementUploadStateCreate>
}) {
  return (
    <form
      class="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void props.upload.submit()
      }}
    >
      <UiUploadDropArea
        testId="replacement-drop-area"
        inputId="replacement-file"
        accept={props.upload.acceptAttribute}
        disabled={props.upload.isBusy()}
        invalid={props.upload.fileError() !== null}
        describedBy={props.upload.fileError() === null ? "replacement-file-hint" : "replacement-file-error"}
        filesSelect={(files) => props.upload.selectFile(files[0] ?? null)}
        title={ttc("Drop a replacement file here or choose one", "Ziehe eine Ersatzdatei hierher oder wähle eine aus")}
        hintId="replacement-file-hint"
        hint={ttc(
          "The replacement must resolve to the same asset class and keeps the current path.",
          "Die Ersatzdatei muss derselben Asset-Klasse entsprechen und behält den aktuellen Pfad.",
        )}
      />

      <Show when={props.upload.file.get()}>
        {(selected) => (
          <p class="text-sm text-muted-foreground" data-testid="replacement-selected-file">
            {ttc("Selected", "Ausgewählt")}: {selected().name} · {uiByteSizeFormat(selected().size)}
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

      <UiUploadProgressBar
        labelId="replacement-progress-label"
        label={props.upload.progress().label}
        percent={props.upload.progress().percent}
        hasFailed={props.upload.stage() === "failed"}
      />

      <Show when={props.upload.errorMessage()}>
        {(message) => (
          <UiNotice tone="negative" role="alert">
            {message()}
          </UiNotice>
        )}
      </Show>

      <Show when={props.upload.stage() === "done"}>
        <UiNotice tone="positive" role="status">
          {ttc(
            "The replacement was accepted and a new source revision is queued.",
            "Die Ersatzdatei wurde angenommen und eine neue Quellrevision wurde eingereiht.",
          )}
        </UiNotice>
      </Show>

      <div class="flex flex-wrap gap-2">
        <ButtonIcon
          type="submit"
          icon={mdiCloudUpload}
          isLoading={props.upload.isBusy()}
          disabled={!props.upload.canSubmit()}
        >
          {ttc("Upload replacement", "Ersatzdatei hochladen")}
        </ButtonIcon>
        <ButtonIcon
          type="button"
          variant="outline"
          icon={mdiRestart}
          disabled={props.upload.isBusy()}
          onClick={props.upload.reset}
        >
          {ttc("Reset", "Zurücksetzen")}
        </ButtonIcon>
      </div>
    </form>
  )
}
