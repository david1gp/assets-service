import { Show } from "solid-js"
import { Label } from "#ui/input/label/Label.jsx"
import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { CodeBlock } from "#ui/static/code/CodeBlock.jsx"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { UiStatusBadge } from "../common/UiStatusBadge.jsx"
import { ttc } from "../localization/ttc.js"
import { uiCatalogEnvironments } from "./uiCatalogEnvironments.js"
import { uiCatalogPageStateCreate } from "./uiCatalogPageStateCreate.js"

/** Shows the current catalog generation and the deterministic generated lists. */
export function UiCatalogPage() {
  const state = uiCatalogPageStateCreate()

  return (
    <>
      <UiPageHeading
        title={ttc("Catalog", "Katalog")}
        subtitle={ttc(
          "The published catalog and the lists generated from it.",
          "Der veröffentlichte Katalog und die daraus erzeugten Listen.",
        )}
      />

      <div class="mb-6 max-w-xs">
        <Label for="catalog-environment">{ttc("Environment", "Umgebung")}</Label>
        <SelectSingleNative
          id="catalog-environment"
          valueSignal={state.environmentSignal}
          getOptions={() => [...uiCatalogEnvironments]}
        />
      </div>

      <UiQueryView
        query={state.query}
        loadingItem={ttc("catalog", "Katalog")}
        isEmpty={(view) => view.catalog === null}
        emptyMessage={ttc(
          "This environment has no published catalog generation yet.",
          "Für diese Umgebung gibt es noch keine veröffentlichte Kataloggenerierung.",
        )}
      >
        {(view) => (
          <Show when={view.catalog === null || view.lists === null ? undefined : view}>
            {(ready) => (
              <div class="flex flex-col gap-6">
                <CardWrapper class="p-4">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="text-lg font-semibold">
                      {ttc("Generation", "Generierung")} {ready().catalog.generationId}
                    </h2>
                    <UiStatusBadge tone={ready().catalog.current ? "positive" : "neutral"}>
                      {ready().catalog.current ? ttc("current", "aktuell") : ttc("superseded", "abgelöst")}
                    </UiStatusBadge>
                  </div>
                  <p class="mt-2 text-sm text-muted-foreground">
                    {ready().catalog.catalog.outputs.length} {ttc("outputs", "Ausgaben")} ·{" "}
                    {ttc("renderer", "Renderer")} {ready().catalog.catalog.rendererVersion}
                  </p>
                  <p class="mt-1 wrap-anywhere font-mono text-xs">{ready().catalog.catalog.digest}</p>
                </CardWrapper>

                <section aria-labelledby="generated-lists-heading">
                  <h2 id="generated-lists-heading" class="text-lg font-semibold">
                    {ttc("Generated lists", "Erzeugte Listen")}
                  </h2>
                  <div class="mt-3 flex flex-col gap-4">
                    <div>
                      <h3 class="font-medium">{ttc("Images", "Bilder")}</h3>
                      <CodeBlock class="mt-1 max-h-72 overflow-auto" data={ready().lists.imageList} />
                    </div>
                    <div>
                      <h3 class="font-medium">{ttc("Videos", "Videos")}</h3>
                      <CodeBlock class="mt-1 max-h-72 overflow-auto" data={ready().lists.videoList} />
                    </div>
                    <div>
                      <h3 class="font-medium">{ttc("Fonts", "Schriften")}</h3>
                      <CodeBlock class="mt-1 max-h-72 overflow-auto" data={ready().lists.fontList} />
                    </div>
                    <div>
                      <h3 class="font-medium">{ttc("Documents", "Dokumente")}</h3>
                      <CodeBlock class="mt-1 max-h-72 overflow-auto" data={ready().lists.documentList} />
                    </div>
                  </div>
                </section>
              </div>
            )}
          </Show>
        )}
      </UiQueryView>
    </>
  )
}
