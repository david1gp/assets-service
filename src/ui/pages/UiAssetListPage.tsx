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
import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { ToggleButton } from "#ui/interactive/toggle/ToggleButton.jsx"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import type { TableColumnDef } from "#ui/table/shared/TableColumnDef.js"
import { Table1R } from "#ui/table/table1/Table1R.jsx"
import { classArr } from "#ui/utils/classArr.js"
import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { UiAssetPreviewImage } from "../common/UiAssetPreviewImage.jsx"
import { UiLinkButton } from "../common/UiLinkButton.jsx"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { UiStatusBadge } from "../common/UiStatusBadge.jsx"
import { uiAssetPathFormat } from "../common/uiAssetPathFormat.js"
import { uiDeletionStatusLabelRead } from "../deletion/uiDeletionStatusLabelRead.js"
import { uiDeletionStatusToneRead } from "../deletion/uiDeletionStatusToneRead.js"
import { ttc } from "../localization/ttc.js"
import { UiOutputTargetBadges } from "../output/UiOutputTargetBadges.jsx"
import { uiAssetOutputTargetsRead } from "../output/uiAssetOutputTargetsRead.js"
import { uiPaths } from "../routing/uiPaths.js"
import { UiAssetStructureView } from "../structure/UiAssetStructureView.jsx"
import { UiStructureAssetFolderSelect } from "../structure/UiStructureAssetFolderSelect.jsx"
import type { uiAssetStructureStateCreate } from "../structure/uiAssetStructureStateCreate.js"
import { uiTableDesktopClassesRead } from "../table/uiTableDesktopClassesRead.js"
import { uiTableMobileClassesRead } from "../table/uiTableMobileClassesRead.js"
import { uiAssetClassOptions, uiAssetListPageStateCreate } from "./uiAssetListPageStateCreate.js"
import { uiAssetPreviewSourceRead } from "./uiAssetPreviewSourceRead.js"
import { uiAssetViewTabIconRead } from "./uiAssetViewTabIconRead.js"
import { uiAssetViewTabs } from "./uiAssetViewTabs.js"

const columnsCreate = (
  projectId: () => string,
  paths: () => Pick<typeof uiPaths.contributor, "asset">,
  showPreviews: () => boolean,
  showFolders: () => boolean,
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

  const columns: TableColumnDef<AssetListItem>[] = [
    {
      id: "path",
      name: ttc("Asset", "Asset"),
      data: (asset) => (showFolders() ? uiAssetPathFormat(asset.folders, asset.filename) : asset.filename),
      cell: (asset) => {
        const preview = () => (showPreviews() ? previewSourceRead(asset) : null)
        const hasFolders = () => showFolders() && asset.folders.length > 0
        return (
          <div class="flex items-center gap-3 min-w-0">
            <Show when={preview()}>
              {(source) => (
                <div class="size-11 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
                  <UiAssetPreviewImage source={source} class="size-full object-contain" />
                </div>
              )}
            </Show>
            <div class="flex flex-col min-w-0">
              <Show when={hasFolders()}>
                <span class="font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
                  {asset.folders.join("/")}/
                </span>
              </Show>
              {/* Narrow viewports wrap the target chips below the filename so they cannot overlap the folder select. */}
              <div class="flex flex-wrap items-center gap-2 min-w-0">
                <A
                  href={paths().asset(projectId(), asset.id)}
                  class="font-mono text-sm font-semibold text-slate-900 hover:text-blue-600 hover:underline dark:text-slate-100 dark:hover:text-blue-400 truncate"
                >
                  {asset.filename}
                </A>
                <UiOutputTargetBadges targets={uiAssetOutputTargetsRead(asset)} />
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
      name: ttc("Class", "Klasse"),
      headerClass: "w-24",
      data: (asset) => asset.class,
      cell: (asset) => (
        <Badge variant="subtle" class="font-mono text-xs capitalize">
          {asset.class}
        </Badge>
      ),
    },
    {
      id: "outputCount",
      name: ttc("Outputs", "Ausgaben"),
      headerClass: "w-20 text-center",
      dataClass: "text-center",
      data: (asset) => asset.outputCount,
      cell: (asset) => (
        <span class="font-mono text-xs font-medium text-slate-600 dark:text-slate-400">{asset.outputCount}</span>
      ),
    },
    {
      id: "updatedAt",
      name: ttc("Updated", "Aktualisiert"),
      headerClass: "w-28",
      data: (asset) => asset.updatedAt,
      cell: (asset) => (
        <time datetime={asset.updatedAt} class="font-mono text-xs text-slate-500 dark:text-slate-400">
          {asset.updatedAt.slice(0, 10)}
        </time>
      ),
    },
  ]

  if (showFolders()) {
    columns.push({
      id: "structureFolder",
      name: ttc("Folder", "Ordner"),
      headerClass: "w-44",
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
            class="w-full min-w-0 p-1 text-xs"
          />
        </Show>
      ),
    })
  }

  return columns
}

/** Flat inventory of every asset in one project with filters and pagination. */
export function UiAssetListPage() {
  const state = uiAssetListPageStateCreate()
  const columns = () =>
    columnsCreate(
      state.projectId,
      state.paths,
      state.showPreviews.get,
      state.showFolders.get,
      state.isFolderAssignmentVisible,
      state.structure,
    )
  const tablistClass =
    "inline-flex items-center rounded-lg border border-slate-200 bg-slate-100/80 p-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400"

  return (
    <>
      <UiPageHeading
        title={ttc("Assets", "Assets")}
        subtitle={ttc(
          "Every asset in this project, filtered by class, folder, or name.",
          "Alle Assets dieses Projekts, gefiltert nach Klasse, Ordner oder Name.",
        )}
        actions={
          <UiLinkButton href={state.paths().upload(state.projectId())} icon={mdiCloudUpload}>
            {ttc("Upload asset", "Asset hochladen")}
          </UiLinkButton>
        }
      />

      {/* Controls: View switcher, display options & search/filters */}
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label={ttc("Asset views", "Asset-Ansichten")} class={tablistClass}>
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
                    class={classArr(
                      "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-all",
                      active()
                        ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
                    )}
                    onClick={() => state.tabSignal.set(value)}
                  >
                    <span>{value === "list" ? ttc("List", "Liste") : ttc("Structure", "Struktur")}</span>
                  </ButtonIcon>
                )
              }}
            </For>
          </div>

          <ToggleButton
            title={
              state.showPreviews.get()
                ? ttc("Hide image previews", "Bildvorschauen ausblenden")
                : ttc("Show image previews", "Bildvorschauen anzeigen")
            }
            pressedSignal={state.showPreviews}
            class="text-xs"
          >
            <Icon class="mr-1.5 size-4" path={state.showPreviews.get() ? mdiEyeOff : mdiEye} />
            <span>
              {state.showPreviews.get()
                ? ttc("Hide previews", "Vorschauen ausblenden")
                : ttc("Show previews", "Vorschauen anzeigen")}
            </span>
          </ToggleButton>

          <ToggleButton
            title={
              state.showFolders.get()
                ? ttc("Hide folders", "Ordner ausblenden")
                : ttc("Show folders", "Ordner anzeigen")
            }
            pressedSignal={state.showFolders}
            class="text-xs"
          >
            <Icon class="mr-1.5 size-4" path={state.showFolders.get() ? mdiFolderOffOutline : mdiFolderOutline} />
            <span>
              {state.showFolders.get()
                ? ttc("Hide folders", "Ordner ausblenden")
                : ttc("Show folders", "Ordner anzeigen")}
            </span>
          </ToggleButton>

          {/* Assigning an asset to a folder is meaningless while folders are hidden. */}
          <Show when={state.showFolders.get()}>
            <ToggleButton
              title={
                state.showFolderAssignment.get()
                  ? ttc("Hide folder assignment", "Ordnerzuweisung ausblenden")
                  : ttc("Show folder assignment", "Ordnerzuweisung anzeigen")
              }
              pressedSignal={state.showFolderAssignment}
              class="text-xs"
            >
              <Icon
                class="mr-1.5 size-4"
                path={state.showFolderAssignment.get() ? mdiFolderCancelOutline : mdiFolderMoveOutline}
              />
              <span>
                {state.showFolderAssignment.get()
                  ? ttc("Hide assignment", "Zuweisung ausblenden")
                  : ttc("Show assignment", "Zuweisung anzeigen")}
              </span>
            </ToggleButton>
          </Show>
        </div>

        {/* The filters are shared by both views so switching tabs keeps the same asset set. */}
        <form
          class="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            state.applyFilters()
          }}
        >
          <div class="w-44 sm:w-52">
            <InputS
              id="asset-search"
              type="search"
              maxLength={255}
              valueSignal={state.searchDraft}
              placeholder={ttc("Filename...", "Dateiname...")}
              aria-label={ttc("Search filename", "Dateiname suchen")}
              class="text-xs"
            />
          </div>
          <Show when={state.showFolders.get()}>
            <div class="w-36 sm:w-44">
              <SelectSingleNative
                id="asset-folder"
                aria-label={ttc("Folder", "Ordner")}
                valueSignal={state.folderDraft}
                getOptions={state.folderOptions}
                valueText={(value) => (value === "" ? ttc("All folders", "Alle Ordner") : value)}
                class="py-2 text-xs"
              />
            </div>
          </Show>
          <div class="w-32 sm:w-36">
            <SelectSingleNative
              id="asset-class"
              aria-label={ttc("Class", "Klasse")}
              valueSignal={state.classDraft}
              getOptions={() => [...uiAssetClassOptions]}
              valueText={(value) =>
                value === "all" ? ttc("All classes", "Alle Klassen") : value.charAt(0).toUpperCase() + value.slice(1)
              }
              class="py-2 text-xs"
            />
          </div>
          <ButtonIcon type="submit" icon={mdiMagnify} class="text-xs">
            {ttc("Apply", "Anwenden")}
          </ButtonIcon>
          <ButtonIcon
            type="button"
            icon={mdiClose}
            variant="outline"
            disabled={!state.hasFilters()}
            onClick={state.clearFilters}
            class="text-xs"
          >
            {ttc("Clear", "Leeren")}
          </ButtonIcon>
        </form>
      </div>

      <Show when={state.hasFilters()}>
        <div class="-mt-3 mb-6 flex flex-wrap items-center gap-2">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400">
            {ttc("Active filters:", "Aktive Filter:")}
          </span>
          <Show when={state.search()}>
            {(searchTerm) => (
              <span class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                <span>
                  {ttc("search", "Suche")}: "{searchTerm()}"
                </span>
                <ButtonIcon
                  type="button"
                  title={ttc("Remove search filter", "Suchfilter entfernen")}
                  aria-label={ttc("Remove search filter", "Suchfilter entfernen")}
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
                <span>
                  {ttc("folder", "Ordner")}: "{folderTerm()}"
                </span>
                <ButtonIcon
                  type="button"
                  title={ttc("Remove folder filter", "Ordnerfilter entfernen")}
                  aria-label={ttc("Remove folder filter", "Ordnerfilter entfernen")}
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
                <span>
                  {ttc("class", "Klasse")}: {classTerm()}
                </span>
                <ButtonIcon
                  type="button"
                  title={ttc("Remove class filter", "Klassenfilter entfernen")}
                  aria-label={ttc("Remove class filter", "Klassenfilter entfernen")}
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
            {ttc("Clear all", "Alle leeren")}
          </Button>
        </div>
      </Show>

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
          <UiQueryView query={state.query} loadingItem={ttc("assets", "Assets")}>
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
                      {state.hasFilters()
                        ? ttc("No matching assets", "Keine passenden Assets")
                        : ttc("No assets in this project", "Keine Assets in diesem Projekt")}
                    </h3>
                    <p class="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                      {state.hasFilters()
                        ? ttc(
                            "No assets matched your search or filter criteria. Try adjusting or clearing your filters.",
                            "Keine Assets entsprechen deiner Suche oder deinen Filterkriterien. Passe die Filter an oder leere sie.",
                          )
                        : ttc(
                            "Upload your first image, video, font, or document to populate this project's asset inventory.",
                            "Lade dein erstes Bild, Video, deine erste Schrift oder dein erstes Dokument hoch, um das Asset-Inventar zu füllen.",
                          )}
                    </p>
                    <div class="mt-5">
                      <Show
                        when={state.hasFilters()}
                        fallback={
                          <UiLinkButton href={state.paths().upload(state.projectId())} icon={mdiCloudUpload}>
                            {ttc("Upload asset", "Asset hochladen")}
                          </UiLinkButton>
                        }
                      >
                        <ButtonIcon icon={mdiClose} variant="outline" onClick={state.clearFilters}>
                          {ttc("Clear filters", "Filter leeren")}
                        </ButtonIcon>
                      </Show>
                    </div>
                  </CardWrapper>
                }
              >
                <div class="flex flex-col gap-4">
                  <CardWrapper class="overflow-hidden border border-slate-200 bg-white p-0 lg:p-0 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <Table1R
                      rows={[...(data?.assets ?? [])]}
                      columns={columns()}
                      desktopClasses={uiTableDesktopClassesRead({
                        class: "w-full table-fixed text-left text-sm",
                      })}
                      mobileClasses={uiTableMobileClassesRead()}
                    />
                  </CardWrapper>
                  {/* Result summary sits below the table, next to the pager it describes. */}
                  <div class="flex flex-wrap items-center justify-between gap-2 px-1">
                    <UiPager
                      isFirstPage={state.isFirstPage()}
                      nextCursor={state.nextCursor()}
                      onFirstPage={state.goToFirstPage}
                      onNextPage={state.goToNextPage}
                    />
                    <span class="text-xs text-slate-500 dark:text-slate-400">{state.pageSummaryText()}</span>
                  </div>
                </div>
              </Show>
            )}
          </UiQueryView>
        </Show>
      </div>
    </>
  )
}
