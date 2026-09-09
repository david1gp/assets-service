import { mdiArrowLeft } from "@adaptive-ds/mdi/mdiArrowLeft.js"
import { mdiContentSaveOutline } from "@adaptive-ds/mdi/mdiContentSaveOutline.js"
import { mdiDownloadOutline } from "@adaptive-ds/mdi/mdiDownloadOutline.js"
import { mdiFileOutline } from "@adaptive-ds/mdi/mdiFileOutline.js"
import { mdiImageOutline } from "@adaptive-ds/mdi/mdiImageOutline.js"
import { mdiTrashCanOutline } from "@adaptive-ds/mdi/mdiTrashCanOutline.js"
import { A } from "@solidjs/router"
import { Show } from "solid-js"
import { Label } from "#ui/input/label/Label.jsx"
import { TextareaS } from "#ui/input/textarea/TextareaS.jsx"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { Img } from "#ui/static/img/Img.jsx"
import { UiNotice } from "../common/UiNotice.jsx"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { ttc } from "../localization/ttc.js"
import { uiContributorAssetDetailPageStateCreate } from "./uiContributorAssetDetailPageStateCreate.js"

/** Simplified contributor detail focused on preview and accessible customer-facing copy. */
export function UiContributorAssetDetailPage() {
  const state = uiContributorAssetDetailPageStateCreate()

  return (
    <>
      <A
        href={state.assetsPath()}
        class="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-slate-900 dark:hover:text-slate-100"
      >
        <Icon path={mdiArrowLeft} class="size-4" />
        {ttc("Back to assets", "Zurück zu den Assets")}
      </A>
      <UiPageHeading
        title={state.pageTitle()}
        subtitle={ttc(
          "Preview the file and manage its supported details.",
          "Zeigen Sie die Datei in der Vorschau an und verwalten Sie die unterstützten Angaben.",
        )}
      />

      <Show when={state.actionError()}>
        {(message) => (
          <UiNotice tone="negative" role="alert" class="mb-6">
            <p class="font-semibold">
              {ttc("Your change could not be completed.", "Ihre Änderung konnte nicht abgeschlossen werden.")}
            </p>
            <p class="mt-1 text-sm">{message()}</p>
          </UiNotice>
        )}
      </Show>

      <UiQueryView query={state.query} loadingItem={ttc("asset", "Asset")}>
        {(asset) => (
          <div class="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
            <CardWrapper class="overflow-hidden border border-slate-200 bg-white p-0 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div class="flex min-h-80 items-center justify-center bg-slate-100 p-5 dark:bg-slate-950 sm:min-h-120">
                <Show
                  when={state.preview()}
                  fallback={
                    <div class="flex flex-col items-center gap-3 text-center text-muted-foreground">
                      <Icon
                        path={asset.class === "image" ? mdiImageOutline : mdiFileOutline}
                        class="size-14 text-slate-300 dark:text-slate-700"
                      />
                      <p>
                        {ttc(
                          "No visual preview is available for this file.",
                          "Für diese Datei ist keine visuelle Vorschau verfügbar.",
                        )}
                      </p>
                    </div>
                  }
                >
                  {(preview) => <Img src={preview().url} alt={preview().alt} class="max-h-120 w-full object-contain" />}
                </Show>
              </div>
            </CardWrapper>

            <div class="flex flex-col gap-5">
              <CardWrapper class="border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {ttc("File", "Datei")}
                </p>
                <h2 class="mt-2 wrap-anywhere text-xl font-semibold">{asset.filename}</h2>
                <Show when={state.latestOriginal()}>
                  {(original) => (
                    <a
                      href={original().downloadUrl}
                      download={original().filename}
                      class="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300"
                    >
                      <Icon path={mdiDownloadOutline} class="size-4" />
                      {ttc("Download file", "Datei herunterladen")}
                    </a>
                  )}
                </Show>
              </CardWrapper>

              <CardWrapper class="border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <form onSubmit={state.integrationNoteSubmit}>
                  <Label for="contributor-asset-integration-note" class="font-semibold">
                    {ttc("Usage note", "Hinweis zur Verwendung")}
                  </Label>
                  <p class="mt-1 text-sm leading-6 text-muted-foreground">
                    {ttc("Where should this asset be included?", "Wo soll dieses Asset eingebunden werden?")}
                  </p>
                  <div class="mt-3">
                    <TextareaS
                      id="contributor-asset-integration-note"
                      rows={4}
                      maxLength={10000}
                      valueSignal={state.integrationNoteDraft}
                      placeholder={ttc(
                        "Where and how should this asset be used…",
                        "Wo und wie soll dieses Asset verwendet werden …",
                      )}
                    />
                  </div>
                  <div class="mt-4 flex flex-wrap gap-2">
                    <ButtonIcon type="submit" icon={mdiContentSaveOutline} isLoading={state.isPending()}>
                      {ttc("Save usage note", "Hinweis speichern")}
                    </ButtonIcon>
                  </div>
                </form>
              </CardWrapper>

              <Show when={asset.class === "image"}>
                <CardWrapper class="border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <form onSubmit={state.altSubmit}>
                    <Label for="contributor-asset-alt" class="font-semibold">
                      {ttc("Alternative text", "Alternativtext")}
                    </Label>
                    <p class="mt-1 text-sm leading-6 text-muted-foreground">
                      {ttc(
                        "Describe what matters in the image for people who cannot see it.",
                        "Beschreiben Sie, was im Bild wichtig ist, für Menschen, die es nicht sehen können.",
                      )}
                    </p>
                    <div class="mt-3">
                      <TextareaS
                        id="contributor-asset-alt"
                        rows={5}
                        maxLength={10000}
                        valueSignal={state.altDraft}
                        placeholder={ttc("A concise description of the image…", "Eine kurze Beschreibung des Bildes …")}
                      />
                    </div>
                    <div class="mt-4 flex flex-wrap gap-2">
                      <ButtonIcon type="submit" icon={mdiContentSaveOutline} isLoading={state.isPending()}>
                        {ttc("Save alternative text", "Alternativtext speichern")}
                      </ButtonIcon>
                      <ButtonIcon
                        type="button"
                        icon={mdiTrashCanOutline}
                        variant="outline"
                        disabled={state.isPending()}
                        onClick={state.altRemoveClick}
                      >
                        {ttc("Remove alternative text", "Alternativtext entfernen")}
                      </ButtonIcon>
                    </div>
                  </form>
                </CardWrapper>
              </Show>
            </div>
          </div>
        )}
      </UiQueryView>
    </>
  )
}
