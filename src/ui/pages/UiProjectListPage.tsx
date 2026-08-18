import { Table1R } from "#ui/table/table1/Table1R.jsx"
import type { TableColumnDef } from "#ui/table/shared/TableColumnDef.js"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { InputS } from "#ui/input/input/InputS.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { mdiClose, mdiMagnify } from "@mdi/js"
import { A } from "@solidjs/router"
import type { Project } from "../../project/projectSchema.js"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { uiPaths } from "../routing/uiPaths.js"
import { uiProjectListPageStateCreate } from "./uiProjectListPageStateCreate.js"

const columns: TableColumnDef<Project>[] = [
  {
    id: "name",
    name: "Name",
    data: (project) => project.name,
    cell: (project) => (
      <A href={uiPaths.assets(project.id)} class="text-blue-700 underline dark:text-blue-300">
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

      <form
        class="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          state.submitSearch()
        }}
      >
        <div class="min-w-60 flex-1">
          <Label for="project-search">Search projects</Label>
          <InputS id="project-search" type="search" valueSignal={state.searchDraft} placeholder="Project name" />
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
          <>
            <Table1R rows={[...data.projects]} columns={columns} />
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
