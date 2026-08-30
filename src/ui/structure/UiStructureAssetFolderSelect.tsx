import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import type { UiStructureFolderOption } from "./uiStructureFolderOptionsRead.js"
import { uiStructureAssetFolderSelectStateCreate } from "./uiStructureAssetFolderSelectStateCreate.js"

export type UiStructureAssetFolderSelectProps = {
  assetId: string
  assetLabel: string
  selectId: string
  folderId: () => string | null | undefined
  folderOptions: () => readonly UiStructureFolderOption[]
  isDisabled: () => boolean
  assetMove: (assetId: string, folderId: string | null) => void
}

/** Selects an asset's logical structure folder using the shared move action. */
export function UiStructureAssetFolderSelect(p: UiStructureAssetFolderSelectProps) {
  const state = uiStructureAssetFolderSelectStateCreate({
    assetId: () => p.assetId,
    folderId: p.folderId,
    folderOptions: p.folderOptions,
    isDisabled: p.isDisabled,
    assetMove: p.assetMove,
  })

  return (
    <>
      <label class="sr-only" for={p.selectId}>
        Structure folder of {p.assetLabel}
      </label>
      <SelectSingleNative
        id={p.selectId}
        // Below `sm` the select takes its own row so the target chips after the
        // filename stay fully visible instead of being clipped by it.
        class="!w-full shrink-0 basis-full p-1 text-xs sm:!w-36 sm:basis-auto md:!w-40"
        disabled={state.isDisabled()}
        valueSignal={state.valueSignal}
        getOptions={state.optionValues}
        valueText={state.optionText}
      />
    </>
  )
}
