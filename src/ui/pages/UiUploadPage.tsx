import { mdiDelete } from "@adaptive-ds/mdi/mdiDelete.js"
import { For, Show } from "solid-js"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { UiLinkButton } from "../common/UiLinkButton.jsx"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { ttc } from "../localization/ttc.js"
import { UiUploadDropArea } from "../upload/UiUploadDropArea.jsx"
import { UiUploadFileCard } from "./UiUploadFileCard.jsx"
import { uiUploadPageStateCreate } from "./uiUploadPageStateCreate.js"

/** Uploads any number of files straight to object storage and lets folders be edited afterwards. */
export function UiUploadPage() {
  const state = uiUploadPageStateCreate()

  return (
    <>
      <UiPageHeading
        title={ttc("Upload assets", "Assets hochladen")}
        subtitle={ttc(
          "Drop files here to upload them right away; folders can be set once an upload finished.",
          "Lege Dateien hier ab, um sie sofort hochzuladen; Ordner lassen sich nach Abschluss setzen.",
        )}
        actions={
          <Show when={state.mode() === "admin"}>
            <UiLinkButton href={state.jobsHref()} variant="outline">
              {ttc("Open jobs", "Jobs öffnen")}
            </UiLinkButton>
          </Show>
        }
      />

      <div class="flex max-w-4xl flex-col gap-6">
        <UiUploadDropArea
          testId="upload-drop-area"
          inputId="upload-files"
          size="lg"
          multiple
          accept={state.acceptAttribute}
          disabled={false}
          filesSelect={(files) => state.selectFiles(files)}
          title={ttc("Drop files here or click to choose", "Dateien hier ablegen oder zum Auswählen klicken")}
          hintId="upload-files-hint"
          describedBy="upload-files-hint"
          hint={
            <>
              {ttc(
                "JPEG, PNG, WebP, AVIF, GIF, MP4, WebM, TTF, OTF, WOFF, or WOFF2. Every file uploads immediately.",
                "JPEG, PNG, WebP, AVIF, GIF, MP4, WebM, TTF, OTF, WOFF oder WOFF2. Jede Datei wird sofort hochgeladen.",
              )}
              <br />
              {ttc(
                "SVG files are not processed by this service; keep them in the project under `public/`.",
                "SVG-Dateien werden von diesem Dienst nicht verarbeitet; lege sie unter `public/` im Projekt ab.",
              )}
            </>
          }
        />

        <Show when={state.files().length > 0}>
          <section class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-lg font-semibold">{ttc("Files", "Dateien")}</h2>
              <ButtonIcon
                type="button"
                variant="outline"
                icon={mdiDelete}
                disabled={state.hasActiveUploads()}
                onClick={state.clear}
              >
                {ttc("Clear list", "Liste leeren")}
              </ButtonIcon>
            </div>
            <ul class="flex flex-col gap-3">
              <For each={state.files()}>
                {(file) => (
                  <UiUploadFileCard
                    file={file}
                    assetHref={state.assetHref}
                    folderOptions={state.folderOptions}
                    folderSet={state.setFileFolder}
                  />
                )}
              </For>
            </ul>
          </section>
        </Show>
      </div>
    </>
  )
}
