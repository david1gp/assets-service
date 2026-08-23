import { For, Show } from "solid-js"
import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import { UiStructureAssetChip } from "./UiStructureAssetChip.jsx"
import type { UiStructureFolderOption } from "./uiStructureFolderOptionsRead.js"
import { uiStructureDropZoneAttach } from "./uiStructureDropZoneAttach.js"

export type UiStructureDropAreaProps = {
  folderId: string | null
  label: string
  assets: AssetListItem[]
  projectId: string
  pendingAssetIds: ReadonlySet<string>
  folderOptions: UiStructureFolderOption[]
  assetMove: (assetId: string, folderId: string | null) => void
  class?: string
}

/** Drop target listing the assets placed directly in one logical folder. */
export function UiStructureDropArea(p: UiStructureDropAreaProps) {
  return (
    <ul
      aria-label={`Assets in ${p.label}`}
      class={`flex min-h-14 flex-wrap gap-2 rounded-lg border border-dashed border-gray-300 p-2 dark:border-gray-600 ${p.class ?? ""}`}
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
            folderId={p.folderId}
            folderOptions={p.folderOptions}
            isPending={p.pendingAssetIds.has(asset.id)}
            assetMove={p.assetMove}
          />
        )}
      </For>
      <Show when={p.assets.length === 0}>
        <li class="p-1 text-sm text-muted-foreground">Drop assets here</li>
      </Show>
    </ul>
  )
}
