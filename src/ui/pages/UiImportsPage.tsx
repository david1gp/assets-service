import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { InputS } from "#ui/input/input/InputS.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { mdiPlay } from "@adaptive-ds/mdi/mdiPlay.js"
import { For, Show } from "solid-js"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { uiImportsPageStateCreate } from "./uiImportsPageStateCreate.js"
import { UiNotice } from "../common/UiNotice.jsx"

/** Starts legacy imports and shows the progress of earlier ones. */
export function UiImportsPage() {
  const state = uiImportsPageStateCreate()

  return (
    <>
      <UiPageHeading title="Imports" subtitle="Read-only ingestion of an existing asset tree." />

      <CardWrapper class="mb-6 max-w-2xl p-4">
        <form
          class="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void state.start()
          }}
        >
          <div>
            <Label for="import-root">Legacy root directory</Label>
            <InputS id="import-root" required valueSignal={state.root} placeholder="/srv/legacy/assets" />
          </div>
          <Show when={state.errorMessage()}>
            {(message) => (
              <UiNotice tone="negative" role="alert">
                {message()}
              </UiNotice>
            )}
          </Show>
          <ButtonIcon type="submit" icon={mdiPlay} isLoading={state.isPending()}>
            Start import
          </ButtonIcon>
        </form>
      </CardWrapper>

      <UiQueryView
        query={state.query}
        loadingItem="imports"
        emptyMessage="No imports have been requested yet."
        isEmpty={(data) => data.imports.length === 0}
      >
        {(data) => (
          <>
            <ul class="flex flex-col gap-3">
              <For each={data.imports}>
                {(record) => (
                  <li class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    <div>
                      <p class="wrap-anywhere font-mono text-sm">{record.id}</p>
                      <p class="text-sm text-muted-foreground">
                        {record.importedCount} imported · {record.conflicts.length} conflicts
                      </p>
                    </div>
                    <Badge variant="subtle">{record.status}</Badge>
                  </li>
                )}
              </For>
            </ul>
            <UiPager
              isFirstPage={state.isFirstPage()}
              nextCursor={state.nextCursor()}
              onFirstPage={state.goToFirstPage}
              onNextPage={state.goToNextPage}
            />
          </>
        )}
      </UiQueryView>
    </>
  )
}
