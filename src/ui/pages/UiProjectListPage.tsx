import { mdiClose } from "@adaptive-ds/mdi/mdiClose.js"
import { mdiMagnify } from "@adaptive-ds/mdi/mdiMagnify.js"
import { A } from "@solidjs/router"
import { InputS } from "#ui/input/input/InputS.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import type { TableColumnDef } from "#ui/table/shared/TableColumnDef.js"
import { Table1R } from "#ui/table/table1/Table1R.jsx"
import type { Project } from "../../project/projectSchema.js"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { uiPaths } from "../routing/uiPaths.js"
import { uiTableDesktopClassesRead } from "../table/uiTableDesktopClassesRead.js"
import { uiTableMobileClassesRead } from "../table/uiTableMobileClassesRead.js"
import { uiProjectListPageStateCreate } from "./uiProjectListPageStateCreate.js"

const columns: TableColumnDef<Project>[] = [
  {
    id: "name",
    name: "Name",
    data: (project) => project.name,
    cell: (project) => (
      <A href={uiPaths.assets(project.id)} class="font-medium text-blue-700 underline dark:text-blue-300">
        {project.name}
      </A>
    ),
  },
  { id: "slug", name: "Slug", data: (project) => project.slug, cell: (project) => project.slug },
  {
    id: "defaultEnvironment",
    name: "Default environment",
    data: (project) => project.defaultEnvironment,
    cell: (project) => project.defaultEnvironment,
  },
  {
    id: "settings",
    name: "Settings",
    cell: (project) => (
      <A href={uiPaths.projectSettings(project.id)} class="text-blue-700 underline dark:text-blue-300">
        Open settings
      </A>
    ),
  },
]

/** Lists the projects the signed-in principal can administer. */
export function UiProjectListPage() {
  const state = uiProjectListPageStateCreate()

  return (
    <>
      <UiPageHeading title="Projects" subtitle="Pick a project to manage its assets." />

      <CardWrapper class="mb-6 p-4 sm:p-5">
        <form
          class="flex flex-wrap items-end gap-3"
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
      </CardWrapper>

      <UiQueryView
        query={state.query}
        loadingItem="projects"
        emptyMessage="No projects matched this search."
        isEmpty={(data) => data.projects.length === 0}
      >
        {(data) => (
          <div class="flex flex-col gap-4">
            <CardWrapper class="overflow-hidden p-0">
              <Table1R
                rows={[...data.projects]}
                columns={columns}
                desktopClasses={uiTableDesktopClassesRead()}
                mobileClasses={uiTableMobileClassesRead()}
              />
            </CardWrapper>
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
