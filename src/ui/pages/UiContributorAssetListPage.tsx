import { InputS } from "#ui/input/input/InputS.jsx"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { mdiArrowRight } from "@adaptive-ds/mdi/mdiArrowRight.js"
import { mdiClose } from "@adaptive-ds/mdi/mdiClose.js"
import { mdiCloudUploadOutline } from "@adaptive-ds/mdi/mdiCloudUploadOutline.js"
import { mdiFileOutline } from "@adaptive-ds/mdi/mdiFileOutline.js"
import { mdiMagnify } from "@adaptive-ds/mdi/mdiMagnify.js"
import { A } from "@solidjs/router"
import { For, Show } from "solid-js"
import { UiAssetPreviewImage } from "../common/UiAssetPreviewImage.jsx"
import { UiLinkButton } from "../common/UiLinkButton.jsx"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { ttc } from "../localization/ttc.js"
import { uiContributorAssetListPageStateCreate } from "./uiContributorAssetListPageStateCreate.js"

/** Customer-focused asset gallery without operational or storage metadata. */
export function UiContributorAssetListPage() {
  const state = uiContributorAssetListPageStateCreate()

  return (
    <>
      <UiPageHeading
        title={ttc("Choose an asset", "Asset auswählen")}
        subtitle={ttc(
          "Find an existing asset to preview or update.",
          "Finden Sie ein bestehendes Asset zur Vorschau oder Bearbeitung.",
        )}
        actions={
          <UiLinkButton href={state.uploadPath()} icon={mdiCloudUploadOutline}>
            {ttc("Upload new", "Neu hochladen")}
          </UiLinkButton>
        }
      />

      <form class="mb-6 flex max-w-2xl flex-col gap-2 sm:flex-row" role="search" onSubmit={state.searchSubmit}>
        <div class="min-w-0 flex-1">
          <InputS
            id="contributor-asset-search"
            type="search"
            maxLength={255}
            valueSignal={state.searchDraft}
            placeholder={ttc("Search by filename…", "Nach Dateiname suchen …")}
            aria-label={ttc("Search assets by filename", "Assets nach Dateiname suchen")}
          />
        </div>
        <ButtonIcon type="submit" icon={mdiMagnify}>
          {ttc("Search", "Suchen")}
        </ButtonIcon>
        <Show when={state.hasSearch()}>
          <ButtonIcon
            type="button"
            icon={mdiClose}
            variant="outline"
            aria-label={ttc("Clear search", "Suche löschen")}
            onClick={state.searchClear}
          >
            <span class="hidden sm:inline">{ttc("Clear", "Löschen")}</span>
          </ButtonIcon>
        </Show>
      </form>

      <UiQueryView query={state.query} loadingItem={ttc("assets", "Assets")}>
        {(data) => (
          <Show
            when={data.assets.length > 0}
            fallback={
              <CardWrapper class="flex flex-col items-center border border-dashed border-slate-300 bg-white p-10 text-center shadow-none dark:border-slate-700 dark:bg-slate-900">
                <div class="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800">
                  <Icon path={state.hasSearch() ? mdiMagnify : mdiFileOutline} class="size-6" />
                </div>
                <h2 class="mt-4 text-lg font-semibold">
                  {state.hasSearch()
                    ? ttc("No matching assets", "Keine passenden Assets")
                    : ttc("No assets yet", "Noch keine Assets")}
                </h2>
                <p class="mt-2 max-w-md text-sm text-muted-foreground">
                  {state.hasSearch()
                    ? ttc(
                        "Try another filename or clear your search.",
                        "Versuchen Sie einen anderen Dateinamen oder löschen Sie die Suche.",
                      )
                    : ttc(
                        "Upload your first asset to get started.",
                        "Laden Sie Ihr erstes Asset hoch, um zu beginnen.",
                      )}
                </p>
                <Show when={!state.hasSearch()}>
                  <UiLinkButton href={state.uploadPath()} icon={mdiCloudUploadOutline} class="mt-5">
                    {ttc("Upload first asset", "Erstes Asset hochladen")}
                  </UiLinkButton>
                </Show>
              </CardWrapper>
            }
          >
            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <For each={data.assets}>
                {(asset) => {
                  const preview = () => state.previewSourceRead(asset)
                  return (
                    <A
                      href={state.assetPathRead(asset.id)}
                      class="group rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <CardWrapper class="h-full overflow-hidden border border-slate-200 bg-white p-0 shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                        <div class="flex aspect-16/10 items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-950">
                          <Show
                            when={preview()}
                            fallback={<Icon path={mdiFileOutline} class="size-12 text-slate-300 dark:text-slate-700" />}
                          >
                            {(source) => (
                              <UiAssetPreviewImage
                                source={source}
                                class="size-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                              />
                            )}
                          </Show>
                        </div>
                        <div class="p-4">
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                              <h2 class="truncate font-semibold text-slate-900 dark:text-slate-100">
                                {asset.filename}
                              </h2>
                              <Badge variant="subtle" class="mt-2">
                                {state.classLabelRead(asset)}
                              </Badge>
                            </div>
                            <Icon
                              path={mdiArrowRight}
                              class="mt-1 size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1"
                            />
                          </div>
                        </div>
                      </CardWrapper>
                    </A>
                  )
                }}
              </For>
            </div>
            <UiPager
              isFirstPage={state.isFirstPage()}
              nextCursor={state.nextCursor()}
              onFirstPage={state.firstPageOpen}
              onNextPage={state.nextPageOpen}
            />
          </Show>
        )}
      </UiQueryView>
    </>
  )
}
