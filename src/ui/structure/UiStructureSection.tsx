import { For } from "solid-js"
import { UiStructureDropArea } from "./UiStructureDropArea.jsx"
import { UiStructureFolder } from "./UiStructureFolder.jsx"
import type { UiStructureFolderOption } from "./uiStructureFolderOptionsRead.js"
import type { UiStructureNode } from "./uiStructureNode.js"

export type UiStructureSectionProps = {
  node: UiStructureNode
  projectId: string
  showPreviews: () => boolean
  pendingAssetIds: ReadonlySet<string>
  folderOptions: UiStructureFolderOption[]
  assetMove: (assetId: string, folderId: string | null) => void
}

/** Renders one first-level folder as a section holding second-level folder cards. */
export function UiStructureSection(p: UiStructureSectionProps) {
  return (
    <section aria-label={p.node.folder.name} class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">{p.node.folder.name}</h2>
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
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <For each={p.node.children}>
          {(child) => (
            <UiStructureFolder
              node={child}
              projectId={p.projectId}
              showPreviews={p.showPreviews}
              pendingAssetIds={p.pendingAssetIds}
              folderOptions={p.folderOptions}
              assetMove={p.assetMove}
            />
          )}
        </For>
      </div>
    </section>
  )
}
