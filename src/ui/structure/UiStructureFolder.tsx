import { mdiFolderOpenOutline } from "@adaptive-ds/mdi/mdiFolderOpenOutline.js"
import { mdiFolderOutline } from "@adaptive-ds/mdi/mdiFolderOutline.js"
import { For, Show } from "solid-js"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { UiStructureDropArea } from "./UiStructureDropArea.jsx"
import type { UiStructureFolderOption } from "./uiStructureFolderOptionsRead.js"
import type { UiStructureNode } from "./uiStructureNode.js"

export type UiStructureFolderProps = {
  node: UiStructureNode
  projectId: string
  showPreviews: () => boolean
  pendingAssetIds: ReadonlySet<string>
  folderOptions: UiStructureFolderOption[]
  showFolders: () => boolean
  showFolderAssignment: () => boolean
  assetMove: (assetId: string, folderId: string | null) => void
}

/**
 * Renders one second-level folder as a card whose third-level children become
 * outlined areas inside that card.
 */
export function UiStructureFolder(p: UiStructureFolderProps) {
  return (
    <CardWrapper class="flex flex-col gap-3.5 border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/70 sm:p-5">
      <div class="flex items-center justify-between gap-2">
        <h3 class="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Icon path={mdiFolderOutline} class="size-4.5 shrink-0 text-slate-500 dark:text-slate-400" />
          <span class="truncate">{p.node.folder.name}</span>
        </h3>
        <Badge variant="subtle" class="shrink-0 font-mono text-xs">
          {p.node.assets.length} {p.node.assets.length === 1 ? "asset" : "assets"}
        </Badge>
      </div>

      <UiStructureDropArea
        folderId={p.node.folder.id}
        label={p.node.folder.name}
        assets={p.node.assets}
        projectId={p.projectId}
        showPreviews={p.showPreviews}
        pendingAssetIds={p.pendingAssetIds}
        folderOptions={p.folderOptions}
        showFolders={p.showFolders}
        showFolderAssignment={p.showFolderAssignment}
        assetMove={p.assetMove}
      />

      <Show when={p.node.children.length > 0}>
        <div class="flex flex-col gap-3 pt-1">
          <For each={p.node.children}>
            {(child) => (
              <section
                aria-label={`${p.node.folder.name} / ${child.folder.name}`}
                class="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/40"
              >
                <div class="mb-2 flex items-center justify-between gap-2">
                  <h4 class="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <Icon path={mdiFolderOpenOutline} class="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                    <span class="truncate">{child.folder.name}</span>
                  </h4>
                  <Badge variant="subtle" class="shrink-0 font-mono text-[10px]">
                    {child.assets.length}
                  </Badge>
                </div>
                <UiStructureDropArea
                  folderId={child.folder.id}
                  label={child.folder.name}
                  assets={child.assets}
                  projectId={p.projectId}
                  showPreviews={p.showPreviews}
                  pendingAssetIds={p.pendingAssetIds}
                  folderOptions={p.folderOptions}
                  showFolders={p.showFolders}
                  showFolderAssignment={p.showFolderAssignment}
                  assetMove={p.assetMove}
                />
              </section>
            )}
          </For>
        </div>
      </Show>
    </CardWrapper>
  )
}
