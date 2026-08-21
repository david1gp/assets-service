import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { Input } from "#ui/input/input/Input.jsx"
import { InputS } from "#ui/input/input/InputS.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { TextareaS } from "#ui/input/textarea/TextareaS.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { mdiCloudUpload, mdiRestart } from "@mdi/js"
import { Show } from "solid-js"
import { uiByteSizeFormat } from "../common/uiByteSizeFormat.js"
import { UiLinkButton } from "../common/UiLinkButton.jsx"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { uiPaths } from "../routing/uiPaths.js"
import { uiUploadPageStateCreate } from "./uiUploadPageStateCreate.js"
import { UiNotice } from "../common/UiNotice.jsx"

/** Uploads one file straight to object storage and registers it as an asset. */
export function UiUploadPage() {
  const state = uiUploadPageStateCreate()

  return (
    <>
      <UiPageHeading
        title="Upload asset"
        subtitle="The file goes straight to storage; the service records it afterwards."
      />

      <CardWrapper class="max-w-2xl p-4">
        <form
          class="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void state.submit()
          }}
        >
          <div>
            <Label for="upload-file">File</Label>
            <Input
              id="upload-file"
              type="file"
              required
              accept={state.acceptAttribute}
              aria-describedby={state.fileError() === null ? "upload-file-hint" : "upload-file-error"}
              aria-invalid={state.fileError() !== null}
              disabled={state.isBusy()}
              onChange={(event) => state.selectFile(event.currentTarget.files?.item(0) ?? null)}
            />
            <p id="upload-file-hint" class="mt-1 text-sm text-muted-foreground">
              JPEG, PNG, WebP, AVIF, GIF, MP4, WebM, TTF, OTF, WOFF, or WOFF2.
              <br />
              SVG files are not processed by this service; keep them in the project under `public/`.
            </p>
            <Show when={state.file.get()}>
              {(selected) => (
                <p class="mt-1 text-sm text-muted-foreground">
                  {selected().name} · {uiByteSizeFormat(selected().size)}
                </p>
              )}
            </Show>
            <Show when={state.fileError()}>
              {(message) => (
                <UiNotice id="upload-file-error" tone="negative" role="alert" class="mt-2">
                  {message()}
                </UiNotice>
              )}
            </Show>
          </div>

          <fieldset class="flex flex-col gap-3">
            <legend class="mb-1 font-medium">Folders (optional, up to three levels)</legend>
            <div>
              <Label for="upload-folder-1">Folder level 1</Label>
              <InputS id="upload-folder-1" valueSignal={state.folder1} disabled={state.isBusy()} />
            </div>
            <div>
              <Label for="upload-folder-2">Folder level 2</Label>
              <InputS id="upload-folder-2" valueSignal={state.folder2} disabled={state.isBusy()} />
            </div>
            <div>
              <Label for="upload-folder-3">Folder level 3</Label>
              <InputS id="upload-folder-3" valueSignal={state.folder3} disabled={state.isBusy()} />
            </div>
          </fieldset>

          <div>
            <Label for="upload-integration-note">Where should this asset be included?</Label>
            <TextareaS
              id="upload-integration-note"
              rows={4}
              required
              aria-required="true"
              disabled={state.isBusy()}
              valueSignal={state.integrationNote}
            />
          </div>

          <div>
            <p id="upload-progress-label" class="text-sm text-muted-foreground">
              {state.progress().label}
            </p>
            <div
              role="progressbar"
              aria-labelledby="upload-progress-label"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={state.progress().percent}
              class="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
            >
              <div
                class={`h-full ${state.stage() === "failed" ? "bg-red-700" : "bg-blue-700"}`}
                style={{ width: `${state.progress().percent}%` }}
              />
            </div>
          </div>

          <Show when={state.errorMessage()}>
            {(message) => (
              <UiNotice tone="negative" role="alert">
                {message()}
              </UiNotice>
            )}
          </Show>

          <Show when={state.stage() === "done"}>
            <UiNotice tone="positive" role="status">
              <p>The upload was accepted and processing is queued.</p>
              <dl class="mt-2 flex flex-col gap-1 text-sm">
                <Show when={state.uploadStatus()}>
                  {(status) => (
                    <div class="flex gap-2">
                      <dt>Upload status</dt>
                      <dd class="font-medium">{status()}</dd>
                    </div>
                  )}
                </Show>
                <Show when={state.workflowStatus()}>
                  {(status) => (
                    <div class="flex gap-2">
                      <dt>Workflow status</dt>
                      <dd class="font-medium">{status()}</dd>
                    </div>
                  )}
                </Show>
                <Show when={state.workflowId()}>
                  {(id) => (
                    <div class="flex flex-wrap gap-2">
                      <dt>Workflow</dt>
                      <dd class="wrap-anywhere font-mono">{id()}</dd>
                    </div>
                  )}
                </Show>
              </dl>
            </UiNotice>
          </Show>

          <div class="flex flex-wrap gap-2">
            <ButtonIcon type="submit" icon={mdiCloudUpload} isLoading={state.isBusy()} disabled={!state.canSubmit()}>
              Upload
            </ButtonIcon>
            <ButtonIcon
              type="button"
              icon={mdiRestart}
              variant="outline"
              disabled={state.isBusy()}
              onClick={state.reset}
            >
              Reset
            </ButtonIcon>
            <Show when={state.assetId()}>
              {(id) => (
                <>
                  <UiLinkButton href={uiPaths.asset(state.projectId(), id())} variant="outline">
                    Open asset
                  </UiLinkButton>
                  <UiLinkButton href={uiPaths.jobs(state.projectId())} variant="outline">
                    Open jobs
                  </UiLinkButton>
                </>
              )}
            </Show>
          </div>
        </form>
      </CardWrapper>
    </>
  )
}
