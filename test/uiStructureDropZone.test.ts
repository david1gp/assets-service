import { expect, test } from "bun:test"
import { Window } from "happy-dom"

// The drop zone only behaves correctly in a real DOM: the library reads
// `parent.children`, runs its `draggable` predicate against the rendered
// elements and compares that count to `getValues()`. A source-shape assertion
// cannot catch a wrong selector or a registration that happens before the chips
// exist, so this suite renders actual elements and inspects the parent record
// the library builds.
const window = new Window({ url: "http://localhost" })
const globals = globalThis as unknown as Record<string, unknown>
globals.window = window
globals.document = window.document
for (const key of [
  "HTMLElement",
  "Node",
  "MutationObserver",
  "Element",
  "CustomEvent",
  "Event",
  "DocumentFragment",
  "getComputedStyle",
  "requestAnimationFrame",
  "navigator",
  "DOMRect",
  "NodeFilter",
  "AbortController",
]) {
  const value = (window as unknown as Record<string, unknown>)[key]
  if (value !== undefined) globals[key] = value
}

// `solid-js` resolves to its browser build via ./test/testSolidBrowserPreload.ts,
// so `onMount` actually runs here.
const { createRoot } = await import("solid-js")
const { dragStateProps, parents, setDragState } = await import("@formkit/drag-and-drop")
const { uiStructureDropZoneAttach } = await import("../src/ui/structure/uiStructureDropZoneAttach.js")

const document = window.document as unknown as Document

/**
 * Renders a drop area the way the compiled Solid component does: the `ref`
 * callback fires on the still-empty element, the chips are inserted afterwards,
 * and dynamic attributes such as `data-asset-id` are only applied by a render
 * effect that runs after insertion.
 */
const dropAreaRender = (assetIds: string[], folderId: string | null) => {
  const list = document.createElement("ul")
  document.body.appendChild(list)
  const moves: Array<{ assetId: string; folderId: string | null }> = []
  const warnings: string[] = []
  const warnOriginal = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(" "))
  }

  const dispose = createRoot((disposeRoot) => {
    uiStructureDropZoneAttach(list, {
      folderId,
      assetIdsRead: () => assetIds,
      assetMove: (assetId, target) => moves.push({ assetId, folderId: target }),
    })

    const deferredAttributes: Array<() => void> = []
    for (const assetId of assetIds) {
      const chip = document.createElement("li")
      chip.className = "flex w-full min-w-0"
      list.appendChild(chip)
      // `data-asset-id` is a dynamic attribute, so Solid applies it in a render
      // effect that runs only after the chip is already in the DOM.
      deferredAttributes.push(() => chip.setAttribute("data-asset-id", assetId))
    }
    if (assetIds.length === 0) {
      const hint = document.createElement("li")
      hint.textContent = "Drop assets here"
      list.appendChild(hint)
    }
    for (const apply of deferredAttributes) apply()

    return disposeRoot
  })

  console.warn = warnOriginal
  return { list, moves, warnings, dispose }
}

test("registers every rendered asset chip so node and value counts match", () => {
  const { list, warnings, dispose } = dropAreaRender(["asset-a", "asset-b", "asset-c"], "folder-1")

  const parentData = parents.get(list)
  expect(parentData).toBeDefined()
  // The concrete regression: the library saw zero draggable items and warned.
  expect(warnings).toEqual([])
  expect(parentData?.enabledNodes.length).toBe(3)
  expect(parentData?.enabledNodes.map((node) => node.data.value)).toEqual(["asset-a", "asset-b", "asset-c"])

  dispose()
  list.remove()
})

test("marks the registered chips as natively draggable", () => {
  const { list, dispose } = dropAreaRender(["asset-a", "asset-b"], "folder-1")

  const chips = Array.from(list.children) as HTMLElement[]
  expect(chips.every((chip) => chip.draggable)).toBe(true)

  dispose()
  list.remove()
})

test("excludes the empty-state hint from the draggable items", () => {
  const { list, warnings, dispose } = dropAreaRender([], null)

  const parentData = parents.get(list)
  expect(warnings).toEqual([])
  // One hint element is rendered, but zero values exist, so the hint must not
  // be counted as a draggable item.
  expect(list.children.length).toBe(1)
  expect(parentData?.enabledNodes.length).toBe(0)

  dispose()
  list.remove()
})

test("selects exactly the chips the chip component renders", () => {
  // Guards the selector against a chip markup change: a marker the component
  // does not render would silently reduce the drop zone to zero items.
  const { list, dispose } = dropAreaRender(["asset-a", "asset-b"], "folder-1")

  const selected = Array.from(list.querySelectorAll("[data-asset-id]")) as Element[]
  const registered = (parents.get(list)?.enabledNodes.map((node) => node.el) ?? []) as Element[]
  expect(registered).toEqual(selected)

  dispose()
  list.remove()
})

test("persists a drop into another folder exactly once, including unassigned", () => {
  const { list, moves, dispose } = dropAreaRender(["asset-a"], "folder-1")

  const parentData = parents.get(list)
  const unassigned = dropAreaRender([], null)
  const draggedNode = parentData?.enabledNodes[0]
  expect(draggedNode).toBeDefined()

  // Simulate the library committing the drag on the source zone's config.
  parentData?.config.onDragend?.({
    parent: { el: unassigned.list, data: parents.get(unassigned.list) },
    draggedNodes: [draggedNode],
  } as never)

  expect(moves).toEqual([{ assetId: "asset-a", folderId: null }])

  unassigned.dispose()
  unassigned.list.remove()
  dispose()
  list.remove()
})

test("ignores a drop back into the source folder", () => {
  const { list, moves, dispose } = dropAreaRender(["asset-a"], "folder-1")

  const parentData = parents.get(list)
  parentData?.config.onDragend?.({
    parent: { el: list, data: parentData },
    draggedNodes: [parentData?.enabledNodes[0]],
  } as never)

  expect(moves).toEqual([])

  dispose()
  list.remove()
})

test("ignores idle native drags on parent padding and chips, then completes the next library move", () => {
  const source = dropAreaRender(["asset-a"], "folder-1")
  const target = dropAreaRender(["asset-b"], "folder-2")
  const sourceData = parents.get(source.list)
  const draggedNode = sourceData?.enabledNodes[0]
  const sourceChip = source.list.children[0]

  expect(draggedNode).toBeDefined()
  expect(sourceChip).toBeInstanceOf(window.HTMLElement)

  const idleNativeEventCreate = (type: "dragover" | "drop") => {
    const event = new window.Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, "dataTransfer", {
      value: { types: ["Files", "text/uri-list", "text/plain"] },
    })
    return event as unknown as Event
  }

  expect(() => {
    source.list.dispatchEvent(idleNativeEventCreate("dragover"))
    source.list.dispatchEvent(idleNativeEventCreate("drop"))
    sourceChip?.dispatchEvent(idleNativeEventCreate("dragover"))
    sourceChip?.dispatchEvent(idleNativeEventCreate("drop"))
  }).not.toThrow()
  expect(source.moves).toEqual([])
  expect(target.moves).toEqual([])

  const dragEvent = new window.Event("dragover", { bubbles: true, cancelable: true }) as unknown as DragEvent
  setDragState(
    dragStateProps(
      draggedNode as NonNullable<typeof draggedNode>,
      { el: source.list, data: sourceData as NonNullable<typeof sourceData> },
      dragEvent,
      [draggedNode as NonNullable<typeof draggedNode>],
    ),
  )

  target.list.dispatchEvent(new window.Event("dragover", { bubbles: true, cancelable: true }) as unknown as Event)
  const targetChip = target.list.children[0] as HTMLElement
  targetChip.dispatchEvent(new window.Event("dragover", { bubbles: true, cancelable: true }) as unknown as Event)
  targetChip.dispatchEvent(new window.Event("drop", { bubbles: true, cancelable: true }) as unknown as Event)

  expect(source.moves).toEqual([{ assetId: "asset-a", folderId: "folder-2" }])
  expect(target.moves).toEqual([])

  target.dispose()
  target.list.remove()
  source.dispose()
  source.list.remove()
})

test("removes the parent before stale mutation callbacks run after disposal", async () => {
  const { list, warnings, dispose } = dropAreaRender(["asset-a"], "folder-1")
  const parentData = parents.get(list)
  const cleanupWarnings: string[] = []
  const warnOriginal = console.warn
  console.warn = (...args: unknown[]) => {
    cleanupWarnings.push(args.join(" "))
  }

  try {
    dispose()
    expect(parentData?.getValues(list)).toEqual([])
    expect(() => list.replaceChildren()).not.toThrow()
    await Promise.resolve()
  } finally {
    console.warn = warnOriginal
    list.remove()
  }

  expect(warnings).toEqual([])
  expect(cleanupWarnings).toEqual([])
  expect(parents.get(list)).toBeUndefined()
})
