import { mdiClose } from "@adaptive-ds/mdi/mdiClose.js"
import { mdiCloudUpload } from "@adaptive-ds/mdi/mdiCloudUpload.js"
import { mdiEye } from "@adaptive-ds/mdi/mdiEye.js"
import { mdiEyeOff } from "@adaptive-ds/mdi/mdiEyeOff.js"
import { mdiFolderCancelOutline } from "@adaptive-ds/mdi/mdiFolderCancelOutline.js"
import { mdiFolderMoveOutline } from "@adaptive-ds/mdi/mdiFolderMoveOutline.js"
import { mdiFolderMultipleOutline } from "@adaptive-ds/mdi/mdiFolderMultipleOutline.js"
import { mdiFolderOffOutline } from "@adaptive-ds/mdi/mdiFolderOffOutline.js"
import { mdiFolderOutline } from "@adaptive-ds/mdi/mdiFolderOutline.js"
import { mdiFolderSearchOutline } from "@adaptive-ds/mdi/mdiFolderSearchOutline.js"
import { mdiMagnify } from "@adaptive-ds/mdi/mdiMagnify.js"
import { A } from "@solidjs/router"
import { For, Show } from "solid-js"
import { InputS } from "#ui/input/input/InputS.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { ToggleButton } from "#ui/interactive/toggle/ToggleButton.jsx"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { Img } from "#ui/static/img/Img.jsx"
import type { TableColumnDef } from "#ui/table/shared/TableColumnDef.js"
import { Table1R } from "#ui/table/table1/Table1R.jsx"
import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { UiLinkButton } from "../common/UiLinkButton.jsx"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { UiStatusBadge } from "../common/UiStatusBadge.jsx"
import { uiAssetPathFormat } from "../common/uiAssetPathFormat.js"
import { uiDeletionStatusLabelRead } from "../deletion/uiDeletionStatusLabelRead.js"
import { uiDeletionStatusToneRead } from "../deletion/uiDeletionStatusToneRead.js"
import { uiPaths } from "../routing/uiPaths.js"
import { UiStructureAssetFolderSelect } from "../structure/UiStructureAssetFolderSelect.jsx"
import { UiAssetStructureView } from "../structure/UiAssetStructureView.jsx"
import type { uiAssetStructureStateCreate } from "../structure/uiAssetStructureStateCreate.js"
import { uiTableDesktopClassesRead } from "../table/uiTableDesktopClassesRead.js"
import { uiTableMobileClassesRead } from "../table/uiTableMobileClassesRead.js"
import { uiAssetClassOptions, uiAssetListPageStateCreate } from "./uiAssetListPageStateCreate.js"
import { uiAssetPreviewSourceRead } from "./uiAssetPreviewSourceRead.js"
import { uiAssetViewTabIconRead } from "./uiAssetViewTabIconRead.js"
import { uiAssetViewTabs } from "./uiAssetViewTabs.js"

const columnsCreate = (
  projectId: () => string,
  showPreviews: () => boolean,
  showFolderAssignment: () => boolean,
  structure: ReturnType<typeof uiAssetStructureStateCreate>,
): TableColumnDef<AssetListItem>[] => {
  const client = uiApiClientRead()
  const previewSourceRead = (asset: AssetListItem) => {
    if (!client.success) return null
    return uiAssetPreviewSourceRead(asset, {
      outputVersionUrlCreate: (outputVersionId) =>
        client.data.assetOutputVersionContentUrlCreate(projectId(), asset.id, outputVersionId),
      sourceRevisionPreviewUrlCreate: (sourceRevisionId) =>
        client.data.assetSourceRevisionContentUrlCreate(projectId(), asset.id, sourceRevisionId, "preview"),
    })
  }

  return [
    {
      id: "path",
      name: "Asset",
      data: (asset) => uiAssetPathFormat(asset.folders, asset.filename),
      cell: (asset) => {
        const preview = () => (showPreviews() ? previewSourceRead(asset) : null)
        const hasFolders = () => asset.folders.length > 0
        return (
          <div class="flex items-center gap-3 min-w-0">
            <Show when={preview()}>
              {(source) => (
                <div class="size-11 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
                  <Img
                    class="size-full object-contain"
                    src={source().url}
                    alt={source().alt}
                    width={source().kind === "optimized" ? source().width : undefined}
                    height={source().kind === "optimized" ? source().height : undefined}
                  />
                </div>
              )}
            </Show>
            <div class="flex flex-col min-w-0">
              <Show when={hasFolders()}>
                <span class="font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
                  {asset.folders.join("/")}/
                </span>
              </Show>
              <div class="flex items-center gap-2 min-w-0">
                <A
                  href={uiPaths.asset(projectId(), asset.id)}
                  class="font-mono text-sm font-semibold text-slate-900 hover:text-blue-600 hover:underline dark:text-slate-100 dark:hover:text-blue-400 truncate"
                >
                  {asset.filename}
                </A>
                <Show when={asset.deletionStatus}>
                  {(status) => (
                    <UiStatusBadge tone={uiDeletionStatusToneRead(status())}>
                      {uiDeletionStatusLabelRead(status())}
                    </UiStatusBadge>
                  )}
                </Show>
              </div>
            </div>
          </div>
        )
      },
    },
    {
      id: "class",
      name: "Class",
      data: (asset) => asset.class,
      cell: (asset) => (
        <Badge variant="subtle" class="font-mono text-xs capitalize">
          {asset.class}
        </Badge>
      ),
    },
    {
      id: "outputCount",
      name: "Outputs",
      data: (asset) => asset.outputCount,
      cell: (asset) => (
        <span class="font-mono text-xs font-medium text-slate-600 dark:text-slate-400">{asset.outputCount}</span>
      ),
    },
    {
      id: "updatedAt",
      name: "Updated",
      data: (asset) => asset.updatedAt,
      cell: (asset) => (
        <time datetime={asset.updatedAt} class="font-mono text-xs text-slate-500 dark:text-slate-400">
          {asset.updatedAt.slice(0, 10)}
        </time>
      ),
    },
    {
      id: "structureFolder",
      name: "Folder",
      cell: (asset) => (
        <Show when={showFolderAssignment()}>
          <UiStructureAssetFolderSelect
            assetId={asset.id}
            assetLabel={uiAssetPathFormat(asset.folders, asset.filename)}
            selectId={`asset-structure-folder-${asset.id}`}
            folderId={() => structure.assetFolderIdRead(asset.id)}
            folderOptions={structure.folderOptions}
            isDisabled={() => !structure.isReady() || structure.pendingAssetIds().has(asset.id)}
            assetMove={structure.assetMove}
          />
        </Show>
      ),
    },
  ]
}

/** Flat inventory of every asset in one project with filters and pagination. */
export function UiAssetListPage() {
  const state = uiAssetListPageStateCreate()
  const columns = columnsCreate(
    state.projectId,
    state.showPreviews.get,
    state.isFolderAssignmentVisible,
    state.structure,
  )
  const tablistClass =
    "inline-flex items-center rounded-lg border border-slate-200 bg-slate-100/80 p-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400"

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

      {/* Toolbar: View switcher & preview toggle */}
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Asset views" class={tablistClass}>
            <For each={uiAssetViewTabs}>
              {(value) => {
                const active = () => state.tabSignal.get() === value
                return (
                  <ButtonIcon
                    type="button"
                    role="tab"
                    id={`asset-view-tab-${value}`}
                    aria-selected={active()}
                    aria-controls={`asset-view-panel-${value}`}
                    variant={active() ? "filled" : "ghost"}
                    size="none"
                    icon={uiAssetViewTabIconRead(value)}
                    iconClass="size-4 mr-0"
                    class={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                      active()
                        ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    }`}
                    onClick={() => state.tabSignal.set(value)}
                  >
                    <span>{value}</span>
                  </ButtonIcon>
                )
              }}
            </For>
          </div>

          <ToggleButton
            title={state.showPreviews.get() ? "Hide image previews" : "Show image previews"}
            pressedSignal={state.showPreviews}
            class="text-xs"
          >
            <Icon class="mr-1.5 size-4" path={state.showPreviews.get() ? mdiEyeOff : mdiEye} />
            <span>{state.showPreviews.get() ? "Hide previews" : "Show previews"}</span>
          </ToggleButton>

          <ToggleButton
            title={state.showFolders.get() ? "Hide folders" : "Show folders"}
            pressedSignal={state.showFolders}
            class="text-xs"
          >
            <Icon class="mr-1.5 size-4" path={state.showFolders.get() ? mdiFolderOffOutline : mdiFolderOutline} />
            <span>{state.showFolders.get() ? "Hide folders" : "Show folders"}</span>
          </ToggleButton>

          {/* Assigning an asset to a folder is meaningless while folders are hidden. */}
          <Show when={state.showFolders.get()}>
            <ToggleButton
              title={state.showFolderAssignment.get() ? "Hide folder assignment" : "Show folder assignment"}
              pressedSignal={state.showFolderAssignment}
              class="text-xs"
            >
              <Icon
                class="mr-1.5 size-4"
                path={state.showFolderAssignment.get() ? mdiFolderCancelOutline : mdiFolderMoveOutline}
              />
              <span>{state.showFolderAssignment.get() ? "Hide assignment" : "Show assignment"}</span>
            </ToggleButton>
          </Show>
        </div>
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
            <Label
              for="asset-search"
              class="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
            >
              Search
            </Label>
            <div class="mt-1">
              <InputS
                id="asset-search"
                type="search"
                maxLength={255}
                valueSignal={state.searchDraft}
                placeholder="Filename..."
              />
            </div>
          </div>
          <Show when={state.showFolders.get()}>
            <div>
              <Label
                for="asset-folder"
                class="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
              >
                Folder
              </Label>
              <div class="mt-1">
                <SelectSingleNative
                  id="asset-folder"
                  valueSignal={state.folderDraft}
                  getOptions={state.folderOptions}
                  valueText={(value) => (value === "" ? "All folders" : value)}
                />
              </div>
            </div>
          </Show>
          <div>
            <Label
              for="asset-class"
              class="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
            >
              Class
            </Label>
            <div class="mt-1">
              <SelectSingleNative
                id="asset-class"
                valueSignal={state.classDraft}
                getOptions={() => [...uiAssetClassOptions]}
                valueText={(value) =>
                  value === "all" ? "All classes" : value.charAt(0).toUpperCase() + value.slice(1)
                }
              />
            </div>
          </div>
          <div class="flex items-end gap-2">
            <ButtonIcon type="submit" icon={mdiMagnify} class="flex-1">
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

        <Show when={state.hasFilters()}>
          <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/80">
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Active filters:</span>
            <Show when={state.search()}>
              {(searchTerm) => (
                <span class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  <span>search: "{searchTerm()}"</span>
                  <ButtonIcon
                    type="button"
                    title="Remove search filter"
                    aria-label="Remove search filter"
                    icon={mdiClose}
                    size="none"
                    iconClass="size-3 mr-0"
                    class="ml-0.5 rounded-xs p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                    onClick={state.clearSearch}
                  />
                </span>
              )}
            </Show>
            <Show when={state.folder()}>
              {(folderTerm) => (
                <span class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  <span>folder: "{folderTerm()}"</span>
                  <ButtonIcon
                    type="button"
                    title="Remove folder filter"
                    aria-label="Remove folder filter"
                    icon={mdiClose}
                    size="none"
                    iconClass="size-3 mr-0"
                    class="ml-0.5 rounded-xs p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                    onClick={state.clearFolder}
                  />
                </span>
              )}
            </Show>
            <Show when={state.assetClass()}>
              {(classTerm) => (
                <span class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  <span>class: {classTerm()}</span>
                  <ButtonIcon
                    type="button"
                    title="Remove class filter"
                    aria-label="Remove class filter"
                    icon={mdiClose}
                    size="none"
                    iconClass="size-3 mr-0"
                    class="ml-0.5 rounded-xs p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                    onClick={state.clearClass}
                  />
                </span>
              )}
            </Show>
            <Button
              type="button"
              variant="link"
              size="none"
              class="text-xs text-slate-500 hover:text-slate-900 underline dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
              onClick={state.clearFilters}
            >
              Clear all
            </Button>
          </div>
        </Show>
      </CardWrapper>

      {/* Structure view panel */}
      <div
        id="asset-view-panel-structure"
        role="tabpanel"
        aria-labelledby="asset-view-tab-structure"
        hidden={state.tabSignal.get() !== "structure"}
        tabIndex={0}
      >
        <Show when={state.tabSignal.get() === "structure"}>
          <UiAssetStructureView
            projectId={state.projectId()}
            state={state.structure}
            showPreviews={state.showPreviews.get}
            showFolders={state.showFolders.get}
            showFolderAssignment={state.isFolderAssignmentVisible}
          />
        </Show>
      </div>

      {/* List view panel */}
      <div
        id="asset-view-panel-list"
        role="tabpanel"
        aria-labelledby="asset-view-tab-list"
        hidden={state.tabSignal.get() !== "list"}
        tabIndex={0}
      >
        <Show when={state.tabSignal.get() === "list"}>
          <UiQueryView query={state.query} loadingItem="assets">
            {(data) => (
              <Show
                when={(data?.assets.length ?? 0) > 0}
                fallback={
                  <CardWrapper class="flex flex-col items-center justify-center p-8 text-center sm:p-12 border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <div class="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      <Icon
                        path={state.hasFilters() ? mdiFolderSearchOutline : mdiFolderMultipleOutline}
                        class="size-6"
                      />
                    </div>
                    <h3 class="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                      {state.hasFilters() ? "No matching assets" : "No assets in this project"}
                    </h3>
                    <p class="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                      {state.hasFilters()
                        ? "No assets matched your search or filter criteria. Try adjusting or clearing your filters."
                        : "Upload your first image, video, font, or document to populate this project's asset inventory."}
                    </p>
                    <div class="mt-5">
                      <Show
                        when={state.hasFilters()}
                        fallback={
                          <UiLinkButton href={uiPaths.upload(state.projectId())} icon={mdiCloudUpload}>
                            Upload asset
                          </UiLinkButton>
                        }
                      >
                        <ButtonIcon icon={mdiClose} variant="outline" onClick={state.clearFilters}>
                          Clear filters
                        </ButtonIcon>
                      </Show>
                    </div>
                  </CardWrapper>
                }
              >
                <div class="flex flex-col gap-4">
                  {/* Result summary bar */}
                  <div class="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      Showing{" "}
                      <strong class="font-semibold text-slate-700 dark:text-slate-200">
                        {data?.assets.length ?? 0}
                      </strong>{" "}
                      {data?.assets.length === 1 ? "asset" : "assets"}
                    </span>
                    <Show when={!state.isFirstPage()}>
                      <span class="font-mono">Page 2+</span>
                    </Show>
                  </div>

                  <CardWrapper class="overflow-hidden border border-slate-200 bg-white p-0 shadow-xs dark:border-slate-800 dark:bg-slate-900">
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
              </Show>
            )}
          </UiQueryView>
        </Show>
      </div>
    </>
  )
}
