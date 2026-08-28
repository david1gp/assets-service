import {
  dragAndDrop,
  handleNodeDragover,
  handleNodeDrop,
  handleParentDragover,
  handleParentDrop,
  isDragState,
  parents,
  tearDown,
} from "@formkit/drag-and-drop"
import { onCleanup, onMount } from "solid-js"

export type UiStructureDropZoneOptions = {
  /** `null` marks the drop area for assets outside of every logical folder. */
  folderId: string | null
  assetIdsRead: () => string[]
  assetMove: (assetId: string, folderId: string | null) => void
}

/**
 * Maps every registered drop area element to the logical folder it represents so
 * that the area a drag started in can resolve the folder it was dropped into.
 */
const folderIdByElement = new WeakMap<HTMLElement, string | null>()

const dropTargetClasses = [
  "ring-2",
  "ring-blue-500",
  "border-blue-500",
  "bg-blue-50/70",
  "dark:border-blue-400",
  "dark:bg-blue-950/40",
]
let highlighted: HTMLElement | null = null
const highlightSet = (element: HTMLElement | null) => {
  if (highlighted === element) return
  if (highlighted) highlighted.classList.remove(...dropTargetClasses)
  highlighted = element
  if (element) element.classList.add(...dropTargetClasses)
}

/**
 * Makes one logical folder area a drag-and-drop target for asset chips.
 *
 * The library only owns values, never the DOM: with `sortable: false` and no
 * plugin it moves nothing itself, so the rendered chips stay the single source
 * of truth. `getValues` therefore reads the membership state directly and
 * `setValues` is ignored, which keeps the node count and the value count equal
 * at every `remapNodes` and avoids the `draggable items ... does not match ...
 * values` warning that a separately owned value list produces.
 *
 * Membership is persisted on `onDragend` instead of `onTransfer`. `onTransfer`
 * fires for every area the pointer merely crosses, and persisting there
 * re-rendered and detached the dragged chip mid-drag, which made later areas
 * such as `Unassigned` or a nested folder unreachable. `onDragend` runs once,
 * on the config of the area the drag started in, and reports the area the drag
 * ended in.
 */
export const uiStructureDropZoneAttach = (element: HTMLElement, options: UiStructureDropZoneOptions) => {
  folderIdByElement.set(element, options.folderId)
  let disposed = false
  const valuesRead = () => {
    if (disposed) return []
    return options.assetIdsRead()
  }

  // A `ref` callback runs while the element is still empty, so registering here
  // would compare zero rendered chips against the already known values and abort
  // the first remap. `onMount` runs once the children are inserted.
  onMount(() =>
    dragAndDrop<string>({
      parent: element,
      getValues: valuesRead,
      setValues: () => undefined,
      config: {
        group: "ui-structure",
        sortable: false,
        // The empty-state hint shares the list, so only asset chips may be dragged.
        draggable: (child) => child.dataset.assetId !== undefined,
        // FormKit's native handlers assume that a library drag is active. Native
        // OS file, link, and text drops arrive while its shared state is idle.
        handleParentDragover: (data, state) => {
          if (!isDragState(state)) return
          handleParentDragover(data, state)
        },
        handleParentDrop: (data, state) => {
          if (!isDragState(state)) return
          handleParentDrop(data, state)
        },
        handleNodeDragover: (data, state) => {
          if (!isDragState(state)) return
          handleNodeDragover(data, state)
        },
        handleNodeDrop: (data, state) => {
          if (!isDragState(state)) return
          handleNodeDrop(data, state)
        },
        onTransfer: (data) => highlightSet(data.targetParent.el),
        onDragend: (data) => {
          highlightSet(null)
          const targetFolderId = folderIdByElement.get(data.parent.el)
          // An unregistered or unchanged target must not trigger a membership write.
          if (targetFolderId === undefined || targetFolderId === options.folderId) return
          for (const node of data.draggedNodes) options.assetMove(node.data.value, targetFolderId)
        },
      },
    }),
  )

  onCleanup(() => {
    disposed = true
    if (highlighted === element) highlightSet(null)
    folderIdByElement.delete(element)
    tearDown(element)
    parents.delete(element)
  })
}
