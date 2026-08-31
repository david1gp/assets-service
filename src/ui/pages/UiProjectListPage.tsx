import { mdiClose } from "@adaptive-ds/mdi/mdiClose.js"
import { mdiMagnify } from "@adaptive-ds/mdi/mdiMagnify.js"
import { For } from "solid-js"
import { InputS } from "#ui/input/input/InputS.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { uiByteSizeFormat } from "../common/uiByteSizeFormat.js"
import { UiProjectCard } from "./UiProjectCard.jsx"
import { uiProjectListPageStateCreate } from "./uiProjectListPageStateCreate.js"
import { uiProjectListTotalsRead } from "./uiProjectListTotalsRead.js"

/** Lists the projects the signed-in principal can administer. */
export function UiProjectListPage() {
  const state = uiProjectListPageStateCreate()

  return (
    <>
      <UiPageHeading title="Projects" subtitle="Pick a project to manage its assets." />

      <form
        class="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          state.submitSearch()
        }}
      >
        <div class="min-w-60 flex-1">
          <Label for="project-search">Search projects</Label>
          <InputS
            id="project-search"
            type="search"
            maxLength={255}
            valueSignal={state.searchDraft}
            placeholder="Project name"
          />
        </div>
        <ButtonIcon type="submit" icon={mdiMagnify}>
          Search
        </ButtonIcon>
        <ButtonIcon
          type="button"
          icon={mdiClose}
          variant="outline"
          disabled={!state.hasSearch()}
          onClick={state.clearSearch}
        >
          Clear
        </ButtonIcon>
      </form>

      <UiQueryView
        query={state.query}
        loadingItem="projects"
        emptyMessage="No projects matched this search."
        isEmpty={(data) => data.projects.length === 0}
      >
        {(data) => (
          <div class="flex flex-col gap-4">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <For each={data.projects}>{(project) => <UiProjectCard project={project} />}</For>
            </div>
            <p class="text-muted-foreground text-sm" data-testid="project-list-totals">
              {uiProjectListTotalsRead(data.projects).assetCount.toLocaleString("en-US")} assets ·{" "}
              {uiByteSizeFormat(uiProjectListTotalsRead(data.projects).totalFileSize)} space used
            </p>
            <UiPager
              isFirstPage={state.isFirstPage()}
              nextCursor={state.nextCursor()}
              onFirstPage={state.goToFirstPage}
              onNextPage={state.goToNextPage}
            />
          </div>
        )}
      </UiQueryView>
    </>
  )
}
