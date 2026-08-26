import { For, Show } from "solid-js"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { UiStructureDropArea } from "./UiStructureDropArea.jsx"
import type { UiStructureFolderOption } from "./uiStructureFolderOptionsRead.js"
import type { UiStructureNode } from "./uiStructureNode.js"

export type UiStructureFolderProps = {
  node: UiStructureNode
  projectId: string
  showPreviews: () => boolean
  pendingAssetIds: ReadonlySet<string>
  folderOptions: UiStructureFolderOption[]
  assetMove: (assetId: string, folderId: string | null) => void
}

/**
 * Renders one second-level folder as a card whose third-level children become
 * outlined areas inside that card.
 */
export function UiStructureFolder(p: UiStructureFolderProps) {
  return (
    <CardWrapper class="flex flex-col gap-3 p-4">
      <h3 class="font-medium">{p.node.folder.name}</h3>
      <UiStructureDropArea
        folderId={p.node.folder.id}
        label={p.node.folder.name}
        assets={p.node.assets}
        projectId={p.projectId}
        showPreviews={p.showPreviews}
        pendingAssetIds={p.pendingAssetIds}
        folderOptions={p.folderOptions}
        assetMove={p.assetMove}
      />
      <Show when={p.node.children.length > 0}>
        <div class="flex flex-col gap-3">
          <For each={p.node.children}>
            {(child) => (
              <section
                aria-label={`${p.node.folder.name} / ${child.folder.name}`}
                class="rounded-lg border border-gray-300 p-3 dark:border-gray-600"
              >
                <h4 class="mb-2 text-sm font-medium">{child.folder.name}</h4>
                <UiStructureDropArea
                  folderId={child.folder.id}
                  label={child.folder.name}
                  assets={child.assets}
                  projectId={p.projectId}
                  showPreviews={p.showPreviews}
                  pendingAssetIds={p.pendingAssetIds}
                  folderOptions={p.folderOptions}
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
