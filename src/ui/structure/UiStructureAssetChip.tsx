import { mdiDragVertical } from "@adaptive-ds/mdi/mdiDragVertical.js"
import { mdiFileOutline } from "@adaptive-ds/mdi/mdiFileOutline.js"
import { A } from "@solidjs/router"
import { Show } from "solid-js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { UiAssetPreviewImage } from "../common/UiAssetPreviewImage.jsx"
import { UiStatusBadge } from "../common/UiStatusBadge.jsx"
import { uiAssetPathFormat } from "../common/uiAssetPathFormat.js"
import { uiDeletionStatusLabelRead } from "../deletion/uiDeletionStatusLabelRead.js"
import { uiDeletionStatusToneRead } from "../deletion/uiDeletionStatusToneRead.js"
import { ttc } from "../localization/ttc.js"
import { UiOutputTargetBadges } from "../output/UiOutputTargetBadges.jsx"
import { uiAssetOutputTargetsRead } from "../output/uiAssetOutputTargetsRead.js"
import { uiAssetPreviewSourceRead } from "../pages/uiAssetPreviewSourceRead.js"
import { uiPaths } from "../routing/uiPaths.js"
import { uiProjectRouteModeRead } from "../routing/uiProjectRouteModeRead.js"
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
      class="group flex w-full flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-2xs transition-all hover:border-slate-300 hover:shadow-md aria-busy:cursor-wait aria-busy:opacity-60 sm:w-80 md:w-96 dark:border-slate-700/80 dark:bg-slate-800/90 dark:hover:border-slate-600"
      aria-busy={p.isPending}
    >
      {/* Prominent visual preview */}
      <div class="relative flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200/80 bg-slate-100/90 dark:border-slate-700 dark:bg-slate-900/60">
        <Show
          when={preview()}
          fallback={
            <div class="flex size-full items-center justify-center text-slate-400 dark:text-slate-500">
              <Icon path={mdiFileOutline} class="size-12" />
            </div>
          }
        >
          {(source) => <UiAssetPreviewImage source={source} class="size-full object-contain" />}
        </Show>

        <Show when={p.showFolders()}>
          <span
            class="absolute top-2 left-2 flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md bg-white/85 text-slate-500 shadow-xs backdrop-blur-xs transition-colors hover:bg-white hover:text-slate-800 active:cursor-grabbing dark:bg-slate-800/85 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            title={ttc("Drag to move folder", "Ziehen, um den Ordner zu ändern")}
            aria-hidden="true"
          >
            <Icon path={mdiDragVertical} class="size-5" />
          </span>
        </Show>

        <Show when={p.asset.deletionStatus}>
          {(status) => (
            <div class="absolute top-2 right-2">
              <UiStatusBadge tone={uiDeletionStatusToneRead(status())} class="px-1.5 py-0.5 text-[10px] shadow-xs">
                {uiDeletionStatusLabelRead(status())}
              </UiStatusBadge>
            </div>
          )}
        </Show>
      </div>

      {/* Details: path, filename, format badges, and folder assignment */}
      <div class="mt-2.5 flex min-w-0 flex-1 flex-col justify-between gap-2 overflow-hidden">
        <div class="flex min-w-0 flex-col gap-1 overflow-hidden">
          <Show when={hasFolders()}>
            <span class="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
              {p.asset.folders.join("/")}/
            </span>
          </Show>
          <div class="flex min-w-0 flex-nowrap items-center gap-1.5">
            <A
              href={uiPaths[uiProjectRouteModeRead(window.location.pathname) ?? "admin"].asset(p.projectId, p.asset.id)}
              title={label()}
              // The native link drag would start instead of the chip drag.
              draggable={false}
              class="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-slate-900 hover:text-blue-600 hover:underline dark:text-slate-100 dark:hover:text-blue-400"
            >
              {p.asset.filename}
            </A>
            <UiOutputTargetBadges targets={uiAssetOutputTargetsRead(p.asset)} class="shrink-0 px-1.5 py-0.5" />
          </div>
        </div>

        <Show when={p.showFolderAssignment()}>
          <div class="pt-0.5">
            <UiStructureAssetFolderSelect
              assetId={p.asset.id}
              assetLabel={label()}
              selectId={selectId}
              folderId={() => p.folderId}
              folderOptions={() => p.folderOptions}
              isDisabled={() => p.isPending}
              assetMove={p.assetMove}
              class="!w-full text-xs"
            />
          </div>
        </Show>
      </div>
    </li>
  )
}
