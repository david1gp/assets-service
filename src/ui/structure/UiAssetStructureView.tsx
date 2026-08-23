import { mdiFolderPlus } from "@mdi/js"
import { For, Show } from "solid-js"
import { InputS } from "#ui/input/input/InputS.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { UiDialog } from "../common/UiDialog.jsx"
import { UiNotice } from "../common/UiNotice.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { UiStructureDropArea } from "./UiStructureDropArea.jsx"
import { UiStructureSection } from "./UiStructureSection.jsx"
import type { uiAssetStructureStateCreate } from "./uiAssetStructureStateCreate.js"
import { uiStructureUnassignedOptionValue } from "./uiStructureFolderOptionsRead.js"

export type UiAssetStructureViewProps = {
  projectId: string
  state: ReturnType<typeof uiAssetStructureStateCreate>
}

/** Three-level logical folder board with drag-and-drop and select-based moves. */
export function UiAssetStructureView(p: UiAssetStructureViewProps) {
  const parentOptionValues = () => [
    uiStructureUnassignedOptionValue,
    ...p.state
      .folderOptions()
      .filter((option) => option.depth < 3)
      .map((option) => option.id),
  ]
  const parentOptionText = (value: string) =>
    value === uiStructureUnassignedOptionValue
      ? "Top level"
      : (p.state.folderOptions().find((option) => option.id === value)?.path ?? value)

  return (
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center gap-3">
        <ButtonIcon type="button" icon={mdiFolderPlus} onClick={p.state.folderDialogOpen}>
          New folder
        </ButtonIcon>
        <p class="text-sm text-muted-foreground">
          Moving an asset here changes its structure folder only, never its canonical path.
        </p>
      </div>

      <Show when={p.state.actionError()}>
        {(message) => (
          <UiNotice tone="negative" role="alert">
            <p>{message()}</p>
          </UiNotice>
        )}
      </Show>

      <UiQueryView query={p.state.query} loadingItem="the structure">
        {() => (
          <div class="flex flex-col gap-8">
            <For each={p.state.tree().roots}>
              {(node) => (
                <UiStructureSection
                  node={node}
                  projectId={p.projectId}
                  pendingAssetIds={p.state.pendingAssetIds()}
                  folderOptions={p.state.folderOptions()}
                  assetMove={p.state.assetMove}
                />
              )}
            </For>

            <section aria-label="Unassigned" class="flex flex-col gap-3">
              <h2 class="text-lg font-semibold">Unassigned</h2>
              <UiStructureDropArea
                folderId={null}
                label="Unassigned"
                assets={p.state.tree().unassigned}
                projectId={p.projectId}
                pendingAssetIds={p.state.pendingAssetIds()}
                folderOptions={p.state.folderOptions()}
                assetMove={p.state.assetMove}
              />
            </section>
          </div>
        )}
      </UiQueryView>

      <UiDialog
        title="New structure folder"
        description="Folders can be nested up to three levels deep."
        open={p.state.isFolderDialogOpen()}
        onClose={p.state.folderDialogClose}
      >
        <form
          class="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            // Guarded here as well as in the state so a repeated submit while the
            // request is in flight can never create a duplicate folder.
            if (p.state.isFolderPending()) return
            p.state.folderCreate()
          }}
        >
          <div>
            <Label for="structure-folder-name">Name</Label>
            <InputS
              id="structure-folder-name"
              maxLength={255}
              valueSignal={p.state.folderNameDraft}
              placeholder="logos"
            />
          </div>
          <div>
            <Label for="structure-folder-parent">Parent folder</Label>
            <SelectSingleNative
              id="structure-folder-parent"
              valueSignal={p.state.folderParentDraft}
              getOptions={parentOptionValues}
              valueText={parentOptionText}
            />
          </div>
          <div class="flex justify-end gap-2">
            <ButtonIcon type="button" variant="outline" onClick={p.state.folderDialogClose}>
              Cancel
            </ButtonIcon>
            <ButtonIcon
              type="submit"
              icon={mdiFolderPlus}
              isLoading={p.state.isFolderPending()}
              disabled={p.state.isFolderPending()}
            >
              Create folder
            </ButtonIcon>
          </div>
        </form>
      </UiDialog>
    </div>
  )
}
