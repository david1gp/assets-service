import { mdiDragVertical } from "@adaptive-ds/mdi/mdiDragVertical.js"
import { mdiFileOutline } from "@adaptive-ds/mdi/mdiFileOutline.js"
import { A } from "@solidjs/router"
import { Show } from "solid-js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { Img } from "#ui/static/img/Img.jsx"
import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { UiStatusBadge } from "../common/UiStatusBadge.jsx"
import { uiAssetPathFormat } from "../common/uiAssetPathFormat.js"
import { uiDeletionStatusLabelRead } from "../deletion/uiDeletionStatusLabelRead.js"
import { uiDeletionStatusToneRead } from "../deletion/uiDeletionStatusToneRead.js"
import { UiOutputTargetBadges } from "../output/UiOutputTargetBadges.jsx"
import { uiAssetOutputTargetsRead } from "../output/uiAssetOutputTargetsRead.js"
import { uiAssetPreviewSourceRead } from "../pages/uiAssetPreviewSourceRead.js"
import { uiPaths } from "../routing/uiPaths.js"
import { UiStructureAssetFolderSelect } from "./UiStructureAssetFolderSelect.jsx"
import type { UiStructureFolderOption } from "./uiStructureFolderOptionsRead.js"

export type UiStructureAssetChipProps = {
  asset: AssetListItem
  projectId: string
  showPreviews: () => boolean
  folderId: string | null
  folderOptions: UiStructureFolderOption[]
  isPending: boolean
  /** Hides the drag handle when folders are not shown at all. */
  showFolders: () => boolean
  showFolderAssignment: () => boolean
  assetMove: (assetId: string, folderId: string | null) => void
}

/**
 * Draggable asset entry. The native select next to it performs the same move
 * without a pointer, so the structure stays operable by keyboard alone.
 */
export function UiStructureAssetChip(p: UiStructureAssetChipProps) {
  const client = uiApiClientRead()
  const label = () => (p.showFolders() ? uiAssetPathFormat(p.asset.folders, p.asset.filename) : p.asset.filename)
  const selectId = `structure-move-${p.asset.id}`
  const hasFolders = () => p.showFolders() && p.asset.folders.length > 0
  const preview = () => {
    if (!p.showPreviews() || !client.success) return null
    return uiAssetPreviewSourceRead(p.asset, {
      outputVersionUrlCreate: (outputVersionId) =>
        client.data.assetOutputVersionContentUrlCreate(p.projectId, p.asset.id, outputVersionId),
      sourceRevisionPreviewUrlCreate: (sourceRevisionId) =>
        client.data.assetSourceRevisionContentUrlCreate(p.projectId, p.asset.id, sourceRevisionId, "preview"),
    })
  }
  return (
    <li
      data-asset-id={p.asset.id}
      class="group flex w-full min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-2xs transition-all hover:border-slate-300 aria-busy:cursor-wait aria-busy:opacity-60 sm:w-auto sm:max-w-md dark:border-slate-700/80 dark:bg-slate-800/90 dark:hover:border-slate-600"
      aria-busy={p.isPending}
    >
      <Show when={p.showFolders()}>
        <span
          class="shrink-0 cursor-grab text-slate-300 transition-colors group-hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:group-hover:text-slate-400"
          title="Drag to move folder"
          aria-hidden="true"
        >
          <Icon path={mdiDragVertical} class="size-4" />
        </span>
      </Show>

      <Show
        when={preview()}
        fallback={
          <div class="flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
            <Icon path={mdiFileOutline} class="size-4" />
          </div>
        }
      >
        {(source) => (
          <div class="size-9 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
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

      {/* `overflow-hidden` keeps the chips inside this column so they can never reach the folder select. */}
      <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Show when={hasFolders()}>
          <span class="truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">
            {p.asset.folders.join("/")}/
          </span>
        </Show>
        {/* Chips wrap below the filename at every width because they never shrink and would otherwise overflow onto the folder select. */}
        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
          <A
            href={uiPaths.asset(p.projectId, p.asset.id)}
            title={label()}
            // The native link drag would start instead of the chip drag.
            draggable={false}
            class="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-slate-900 hover:text-blue-600 hover:underline dark:text-slate-100 dark:hover:text-blue-400"
          >
            {p.asset.filename}
          </A>
          <UiOutputTargetBadges targets={uiAssetOutputTargetsRead(p.asset)} class="px-1 py-0" />
          <Show when={p.asset.deletionStatus}>
            {(status) => (
              <UiStatusBadge tone={uiDeletionStatusToneRead(status())} class="px-1 py-0 text-[10px]">
                {uiDeletionStatusLabelRead(status())}
              </UiStatusBadge>
            )}
          </Show>
        </div>
      </div>

      <Show when={p.showFolderAssignment()}>
        <UiStructureAssetFolderSelect
          assetId={p.asset.id}
          assetLabel={label()}
          selectId={selectId}
          folderId={() => p.folderId}
          folderOptions={() => p.folderOptions}
          isDisabled={() => p.isPending}
          assetMove={p.assetMove}
        />
      </Show>
    </li>
  )
}
