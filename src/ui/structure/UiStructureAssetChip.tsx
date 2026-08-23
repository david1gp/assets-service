import { A } from "@solidjs/router"
import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import { uiAssetPathFormat } from "../common/uiAssetPathFormat.js"
import { uiPaths } from "../routing/uiPaths.js"
import { type UiStructureFolderOption, uiStructureUnassignedOptionValue } from "./uiStructureFolderOptionsRead.js"

export type UiStructureAssetChipProps = {
  asset: AssetListItem
  projectId: string
  folderId: string | null
  folderOptions: UiStructureFolderOption[]
  isPending: boolean
  assetMove: (assetId: string, folderId: string | null) => void
}

/**
 * Draggable asset entry. The native select next to it performs the same move
 * without a pointer, so the structure stays operable by keyboard alone.
 */
export function UiStructureAssetChip(p: UiStructureAssetChipProps) {
  const label = () => uiAssetPathFormat(p.asset.folders, p.asset.filename)
  const selectId = () => `structure-move-${p.asset.id}`
  const optionValues = () => [uiStructureUnassignedOptionValue, ...p.folderOptions.map((option) => option.id)]
  const optionText = (value: string) =>
    value === uiStructureUnassignedOptionValue
      ? "Unassigned"
      : (p.folderOptions.find((option) => option.id === value)?.path ?? value)

  return (
    <li
      data-asset-id={p.asset.id}
      class="flex w-full min-w-0 flex-nowrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1 aria-busy:opacity-60 sm:w-auto sm:max-w-md dark:border-gray-700 dark:bg-gray-800"
      aria-busy={p.isPending}
    >
      <A
        href={uiPaths.asset(p.projectId, p.asset.id)}
        title={label()}
        // The native link drag would start instead of the chip drag.
        draggable={false}
        class="min-w-0 flex-1 truncate text-sm text-blue-700 underline dark:text-blue-300"
      >
        {label()}
      </A>
      <label class="sr-only" for={selectId()}>
        Structure folder of {label()}
      </label>
      <SelectSingleNative
        id={selectId()}
        class="w-32 shrink-0 p-1 text-xs sm:w-44"
        disabled={p.isPending}
        valueSignal={{
          get: () => p.folderId ?? uiStructureUnassignedOptionValue,
          set: (value) => p.assetMove(p.asset.id, value === uiStructureUnassignedOptionValue ? null : value),
        }}
        getOptions={optionValues}
        valueText={optionText}
      />
    </li>
  )
}
