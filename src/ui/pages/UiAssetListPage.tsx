import { mdiClose } from "@adaptive-ds/mdi/mdiClose.js"
import { mdiCloudUpload } from "@adaptive-ds/mdi/mdiCloudUpload.js"
import { mdiMagnify } from "@adaptive-ds/mdi/mdiMagnify.js"
import { A } from "@solidjs/router"
import { For, Show } from "solid-js"
import { InputS } from "#ui/input/input/InputS.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import type { TableColumnDef } from "#ui/table/shared/TableColumnDef.js"
import { Table1R } from "#ui/table/table1/Table1R.jsx"
import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import { UiLinkButton } from "../common/UiLinkButton.jsx"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { UiStatusBadge } from "../common/UiStatusBadge.jsx"
import { uiAssetPathFormat } from "../common/uiAssetPathFormat.js"
import { uiDeletionStatusLabelRead } from "../deletion/uiDeletionStatusLabelRead.js"
import { uiDeletionStatusToneRead } from "../deletion/uiDeletionStatusToneRead.js"
import { uiPaths } from "../routing/uiPaths.js"
import { uiTableDesktopClassesRead } from "../table/uiTableDesktopClassesRead.js"
import { uiTableMobileClassesRead } from "../table/uiTableMobileClassesRead.js"
import { UiAssetStructureView } from "../structure/UiAssetStructureView.jsx"
import { uiAssetClassOptions, uiAssetListPageStateCreate } from "./uiAssetListPageStateCreate.js"
import { uiAssetViewTabs } from "./uiAssetViewTabs.js"

const columnsCreate = (projectId: () => string): TableColumnDef<AssetListItem>[] => [
  {
    id: "path",
    name: "Path",
    data: (asset) => uiAssetPathFormat(asset.folders, asset.filename),
    cell: (asset) => (
      <>
        <A href={uiPaths.asset(projectId(), asset.id)} class="wrap-anywhere text-blue-700 underline dark:text-blue-300">
          {uiAssetPathFormat(asset.folders, asset.filename)}
        </A>
        <Show when={asset.deletionStatus}>
          {(status) => (
            <UiStatusBadge class="ml-2" tone={uiDeletionStatusToneRead(status())}>
              {uiDeletionStatusLabelRead(status())}
            </UiStatusBadge>
          )}
        </Show>
      </>
    ),
  },
  {
    id: "class",
    name: "Class",
    data: (asset) => asset.class,
    cell: (asset) => <Badge variant="subtle">{asset.class}</Badge>,
  },
  {
    id: "outputCount",
    name: "Outputs",
    data: (asset) => asset.outputCount,
    cell: (asset) => asset.outputCount,
  },
  {
    id: "updatedAt",
    name: "Updated",
    data: (asset) => asset.updatedAt,
    cell: (asset) => <time datetime={asset.updatedAt}>{asset.updatedAt.slice(0, 10)}</time>,
  },
]

/** Flat inventory of every asset in one project with filters and pagination. */
export function UiAssetListPage() {
  const state = uiAssetListPageStateCreate()
  const columns = columnsCreate(state.projectId)

  return (
    <>
      <UiPageHeading
        title="Assets"
        subtitle="Every asset in this project, filtered by class, folder, or name."
        actions={
          <UiLinkButton href={uiPaths.upload(state.projectId())} icon={mdiCloudUpload}>
            Upload asset
          </UiLinkButton>
        }
      />

      <div role="tablist" aria-label="Asset views" class="mb-6 flex gap-2">
        <For each={uiAssetViewTabs}>
          {(value) => (
            <button
              type="button"
              role="tab"
              id={`asset-view-tab-${value}`}
              aria-selected={state.tabSignal.get() === value}
              aria-controls={`asset-view-panel-${value}`}
              class="rounded-lg border border-gray-300 px-3 py-1.5 capitalize aria-selected:bg-gray-900 aria-selected:text-white dark:border-gray-600 dark:aria-selected:bg-gray-100 dark:aria-selected:text-gray-900"
              onClick={() => state.tabSignal.set(value)}
            >
              {value}
            </button>
          )}
        </For>
      </div>

      {/* The filters are shared by both views so switching tabs keeps the same asset set. */}
      <CardWrapper class="mb-6 p-4 sm:p-5">
        <form
          class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault()
            state.applyFilters()
          }}
        >
          <div>
            <Label for="asset-search">Search</Label>
            <InputS
              id="asset-search"
              type="search"
              maxLength={255}
              valueSignal={state.searchDraft}
              placeholder="Filename"
            />
          </div>
          <div>
            <Label for="asset-folder">Folder</Label>
            <InputS id="asset-folder" maxLength={255} valueSignal={state.folderDraft} placeholder="brand/logos" />
          </div>
          <div>
            <Label for="asset-class">Class</Label>
            <SelectSingleNative
              id="asset-class"
              valueSignal={state.classDraft}
              getOptions={() => [...uiAssetClassOptions]}
              valueText={(value) => (value === "all" ? "All classes" : value)}
            />
          </div>
          <div class="flex items-end gap-2">
            <ButtonIcon type="submit" icon={mdiMagnify}>
              Apply
            </ButtonIcon>
            <ButtonIcon
              type="button"
              icon={mdiClose}
              variant="outline"
              disabled={!state.hasFilters()}
              onClick={state.clearFilters}
            >
              Clear
            </ButtonIcon>
          </div>
        </form>
      </CardWrapper>

      <div
        id="asset-view-panel-structure"
        role="tabpanel"
        aria-labelledby="asset-view-tab-structure"
        hidden={state.tabSignal.get() !== "structure"}
        tabIndex={0}
      >
        <Show when={state.tabSignal.get() === "structure"}>
          <UiAssetStructureView projectId={state.projectId()} state={state.structure} />
        </Show>
      </div>

      <div
        id="asset-view-panel-list"
        role="tabpanel"
        aria-labelledby="asset-view-tab-list"
        hidden={state.tabSignal.get() !== "list"}
        tabIndex={0}
      >
        <Show when={state.tabSignal.get() === "list"}>
          <UiQueryView
            query={state.query}
            loadingItem="assets"
            emptyMessage="No assets matched these filters."
            isEmpty={(data) => (data?.assets.length ?? 0) === 0}
          >
            {(data) => (
              <div class="flex flex-col gap-4">
                <CardWrapper class="overflow-hidden p-0">
                  <Table1R
                    rows={[...(data?.assets ?? [])]}
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
        </Show>
      </div>
    </>
  )
}
