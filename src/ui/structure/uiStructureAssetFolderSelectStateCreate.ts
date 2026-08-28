import type { SignalObject } from "#ui/utils/createSignalObject.js"
import type { UiStructureFolderOption } from "./uiStructureFolderOptionsRead.js"
import { uiStructureUnassignedOptionValue } from "./uiStructureFolderOptionsRead.js"

type UiStructureAssetFolderSelectStateInput = {
  assetId: () => string
  folderId: () => string | null | undefined
  folderOptions: () => readonly UiStructureFolderOption[]
  isDisabled: () => boolean
  assetMove: (assetId: string, folderId: string | null) => void
}

/** Holds the reactive value and flat options for one structure-folder select. */
export const uiStructureAssetFolderSelectStateCreate = (input: UiStructureAssetFolderSelectStateInput) => {
  const optionValues = () => [uiStructureUnassignedOptionValue, ...input.folderOptions().map((option) => option.id)]
  const optionText = (value: string) =>
    value === uiStructureUnassignedOptionValue
      ? "Unassigned"
      : (input.folderOptions().find((option) => option.id === value)?.path ?? value)
  const valueSignal: SignalObject<string> = {
    get: () => input.folderId() ?? uiStructureUnassignedOptionValue,
    set: (nextValue) => {
      input.assetMove(input.assetId(), nextValue === uiStructureUnassignedOptionValue ? null : nextValue)
    },
  }

  return { valueSignal, optionValues, optionText, isDisabled: input.isDisabled }
}
