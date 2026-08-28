import { mdiFolderUploadOutline } from "@adaptive-ds/mdi/mdiFolderUploadOutline.js"
import { For, Show } from "solid-js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import { UiStructureAssetChip } from "./UiStructureAssetChip.jsx"
import { uiStructureDropZoneAttach } from "./uiStructureDropZoneAttach.js"
import type { UiStructureFolderOption } from "./uiStructureFolderOptionsRead.js"

export type UiStructureDropAreaProps = {
  folderId: string | null
  label: string
  assets: AssetListItem[]
  projectId: string
  showPreviews: () => boolean
  pendingAssetIds: ReadonlySet<string>
  folderOptions: UiStructureFolderOption[]
  showFolders: () => boolean
  showFolderAssignment: () => boolean
  assetMove: (assetId: string, folderId: string | null) => void
  class?: string
}

/** Drop target listing the assets placed directly in one logical folder. */
export function UiStructureDropArea(p: UiStructureDropAreaProps) {
  return (
    <ul
      aria-label={`Assets in ${p.label}`}
      class={`flex min-h-14 flex-wrap items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-2.5 transition-colors duration-150 dark:border-slate-800 dark:bg-slate-900/30 ${p.class ?? ""}`}
      ref={(element) =>
        uiStructureDropZoneAttach(element, {
          folderId: p.folderId,
          assetIdsRead: () => p.assets.map((asset) => asset.id),
          assetMove: p.assetMove,
        })
      }
    >
      <For each={p.assets}>
        {(asset) => (
          <UiStructureAssetChip
            asset={asset}
            projectId={p.projectId}
            showPreviews={p.showPreviews}
            folderId={p.folderId}
            folderOptions={p.folderOptions}
            isPending={p.pendingAssetIds.has(asset.id)}
            showFolders={p.showFolders}
            showFolderAssignment={p.showFolderAssignment}
            assetMove={p.assetMove}
          />
        )}
      </For>
      <Show when={p.assets.length === 0}>
        <li class="flex items-center gap-1.5 p-1 text-xs font-medium text-slate-400 dark:text-slate-500">
          <Icon path={mdiFolderUploadOutline} class="size-4 shrink-0" />
          <span>Drop assets here</span>
        </li>
      </Show>
    </ul>
  )
}
