import { mdiClose } from "@adaptive-ds/mdi/mdiClose.js"
import { mdiFolderOffOutline } from "@adaptive-ds/mdi/mdiFolderOffOutline.js"
import { mdiFolderPlus } from "@adaptive-ds/mdi/mdiFolderPlus.js"
import { For, Show } from "solid-js"
import { InputS } from "#ui/input/input/InputS.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { UiDialog } from "../common/UiDialog.jsx"
import { UiNotice } from "../common/UiNotice.jsx"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { UiStructureDropArea } from "./UiStructureDropArea.jsx"
import { UiStructureSection } from "./UiStructureSection.jsx"
import type { uiAssetStructureStateCreate } from "./uiAssetStructureStateCreate.js"
import { uiStructureUnassignedOptionValue } from "./uiStructureFolderOptionsRead.js"
import { uiStructureTreeAssetsRead } from "./uiStructureTreeAssetsRead.js"

export type UiAssetStructureViewProps = {
  projectId: string
  state: ReturnType<typeof uiAssetStructureStateCreate>
  showPreviews: () => boolean
  /** Hides every folder affordance: sections, folder cards, and folder creation. */
  showFolders: () => boolean
  showFolderAssignment: () => boolean
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
      <Show when={p.showFolders()}>
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
          <div class="flex flex-wrap items-center gap-3">
            <ButtonIcon type="button" icon={mdiFolderPlus} onClick={p.state.folderDialogOpen}>
              New folder
            </ButtonIcon>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Moving an asset here changes its structure folder only, never its canonical path.
            </p>
          </div>
          <Badge variant="subtle" class="font-mono text-xs">
            {p.state.folderOptions().length} {p.state.folderOptions().length === 1 ? "folder" : "folders"}
          </Badge>
        </div>
      </Show>

      <Show when={p.state.actionError()}>
        {(message) => (
          <UiNotice tone="negative" role="alert">
            <p>{message()}</p>
          </UiNotice>
        )}
      </Show>

      <UiQueryView query={p.state.query} loadingItem="the structure">
        {(data) => (
          <div class="flex flex-col gap-4">
            <div class="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Showing{" "}
                <strong class="font-semibold text-slate-700 dark:text-slate-200">{data?.assets.length ?? 0}</strong>{" "}
                {data?.assets.length === 1 ? "asset" : "assets"}
              </span>
              <Show when={!p.state.isFirstPage()}>
                <span class="font-mono">Page 2+</span>
              </Show>
            </div>

            <Show
              when={p.showFolders()}
              fallback={
                <section aria-label="Assets" class="flex flex-col gap-3">
                  <UiStructureDropArea
                    folderId={null}
                    label="Assets"
                    assets={uiStructureTreeAssetsRead(p.state.tree())}
                    projectId={p.projectId}
                    showPreviews={p.showPreviews}
                    pendingAssetIds={p.state.pendingAssetIds()}
                    folderOptions={p.state.folderOptions()}
                    showFolders={p.showFolders}
                    showFolderAssignment={p.showFolderAssignment}
                    assetMove={p.state.assetMove}
                  />
                </section>
              }
            >
              <div class="flex flex-col gap-8">
                <For each={p.state.tree().roots}>
                  {(node) => (
                    <UiStructureSection
                      node={node}
                      projectId={p.projectId}
                      showPreviews={p.showPreviews}
                      pendingAssetIds={p.state.pendingAssetIds()}
                      folderOptions={p.state.folderOptions()}
                      showFolders={p.showFolders}
                      showFolderAssignment={p.showFolderAssignment}
                      assetMove={p.state.assetMove}
                    />
                  )}
                </For>

                <section aria-label="Unassigned" class="flex flex-col gap-3">
                  <div class="flex items-center justify-between gap-3">
                    <h2 class="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                      <Icon path={mdiFolderOffOutline} class="size-5 text-slate-500 dark:text-slate-400" />
                      <span>Unassigned</span>
                    </h2>
                    <Badge variant="subtle" class="font-mono text-xs">
                      {p.state.tree().unassigned.length} {p.state.tree().unassigned.length === 1 ? "asset" : "assets"}
                    </Badge>
                  </div>
                  <UiStructureDropArea
                    folderId={null}
                    label="Unassigned"
                    assets={p.state.tree().unassigned}
                    projectId={p.projectId}
                    showPreviews={p.showPreviews}
                    pendingAssetIds={p.state.pendingAssetIds()}
                    folderOptions={p.state.folderOptions()}
                    showFolders={p.showFolders}
                    showFolderAssignment={p.showFolderAssignment}
                    assetMove={p.state.assetMove}
                  />
                </section>
              </div>
            </Show>

            <UiPager
              isFirstPage={p.state.isFirstPage()}
              nextCursor={p.state.nextCursor()}
              onFirstPage={p.state.goToFirstPage}
              onNextPage={p.state.goToNextPage}
            />
          </div>
        )}
      </UiQueryView>

      <Show when={p.showFolders()}>
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
              <Label
                for="structure-folder-name"
                class="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
              >
                Name
              </Label>
              <div class="mt-1">
                <InputS
                  id="structure-folder-name"
                  maxLength={255}
                  valueSignal={p.state.folderNameDraft}
                  placeholder="logos"
                />
              </div>
            </div>
            <div>
              <Label
                for="structure-folder-parent"
                class="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
              >
                Parent folder
              </Label>
              <div class="mt-1">
                <SelectSingleNative
                  id="structure-folder-parent"
                  valueSignal={p.state.folderParentDraft}
                  getOptions={parentOptionValues}
                  valueText={parentOptionText}
                />
              </div>
            </div>
            <div class="mt-2 flex justify-end gap-2">
              <ButtonIcon type="button" icon={mdiClose} variant="outline" onClick={p.state.folderDialogClose}>
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
      </Show>
    </div>
  )
}
