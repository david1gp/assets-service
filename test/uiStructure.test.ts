import { readFile } from "node:fs/promises"

import { expect, test } from "bun:test"

import type { AssetListItem } from "../src/api-client/assetListItemSchema.js"
import { uiStructureTreeCreate } from "../src/ui/structure/uiStructureTreeCreate.js"

const assetCreate = (id: string): AssetListItem =>
  ({
    id,
    projectId: "project-1",
    class: "image",
    folders: [],
    filename: `${id}.jpg`,
    basename: id,
    currentSourceRevisionId: `source-${id}`,
    sourcePath: `/${id}.jpg`,
    outputCount: 0,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  }) as AssetListItem

test("builds a sorted three-level tree with direct assets, empty folders, and unassigned assets", () => {
  const folders = [
    {
      id: "grand-z",
      projectId: "project-1",
      parentId: "child-z",
      name: "grand",
      depth: 3 as const,
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    },
    {
      id: "child-z",
      projectId: "project-1",
      parentId: "root-z",
      name: "child",
      depth: 2 as const,
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    },
    {
      id: "root-z",
      projectId: "project-1",
      parentId: null,
      name: "zeta",
      depth: 1 as const,
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    },
    {
      id: "empty",
      projectId: "project-1",
      parentId: null,
      name: "empty",
      depth: 1 as const,
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    },
    {
      id: "root-a",
      projectId: "project-1",
      parentId: null,
      name: "alpha",
      depth: 1 as const,
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    },
    {
      id: "child-a",
      projectId: "project-1",
      parentId: "root-a",
      name: "child",
      depth: 2 as const,
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    },
  ]
  const assets = ["root", "child", "grand", "direct-a", "null", "missing", "unknown"].map(assetCreate)
  const tree = uiStructureTreeCreate(
    folders,
    assets,
    new Map([
      ["root", "root-z"],
      ["child", "child-z"],
      ["grand", "grand-z"],
      ["direct-a", "root-a"],
      ["null", null],
      ["unknown", "does-not-exist"],
    ]),
  )

  expect(tree.roots.map((node) => node.folder.name)).toEqual(["alpha", "empty", "zeta"])
  expect(tree.roots[1]?.assets).toEqual([])
  expect(tree.roots[2]?.assets.map((asset) => asset.id)).toEqual(["root"])
  expect(tree.roots[2]?.children[0]?.assets.map((asset) => asset.id)).toEqual(["child"])
  expect(tree.roots[2]?.children[0]?.children[0]?.assets.map((asset) => asset.id)).toEqual(["grand"])
  expect(tree.roots[0]?.assets.map((asset) => asset.id)).toEqual(["direct-a"])
  expect(tree.unassigned.map((asset) => asset.id)).toEqual(["null", "missing", "unknown"])
})

test("keeps the structure presentation and list request at the intended boundaries", async () => {
  const view = await readFile("src/ui/structure/UiAssetStructureView.tsx", "utf8")
  const section = await readFile("src/ui/structure/UiStructureSection.tsx", "utf8")
  const folder = await readFile("src/ui/structure/UiStructureFolder.tsx", "utf8")
  const dropArea = await readFile("src/ui/structure/UiStructureDropArea.tsx", "utf8")
  const pageState = await readFile("src/ui/pages/uiAssetListPageStateCreate.ts", "utf8")
  const page = await readFile("src/ui/pages/UiAssetListPage.tsx", "utf8")

  expect(view).toContain('<section aria-label="Unassigned"')
  expect(section).toContain("<UiStructureFolder")
  expect(section).toContain("grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3")
  expect(folder).toContain("<CardWrapper")
  expect(folder).toContain("rounded-lg border border-gray-300")
  expect(dropArea).toContain("Drop assets here")
  expect(dropArea).toContain("aria-label={`Assets in ${p.label}`}")
  // The filter form is rendered once outside the tab branches so it applies to both views.
  expect(page).toContain("The filters are shared by both views")
  expect(page.indexOf('<CardWrapper class="mb-6 p-4 sm:p-5">')).toBeLessThan(
    page.indexOf('<Show when={state.tabSignal.get() === "structure"}>'),
  )
  expect(pageState).toContain("assetListRead(projectId(), {")
  expect(pageState).toContain("limit: 100,")
})

test("associates each asset view tab with its hidden tabpanel", async () => {
  const page = await readFile("src/ui/pages/UiAssetListPage.tsx", "utf8")

  expect(page).toContain('role="tablist" aria-label="Asset views"')
  expect(page).toContain("id={`asset-view-tab-${value}`}")
  expect(page).toContain("aria-controls={`asset-view-panel-${value}`}")
  expect(page).toContain('id="asset-view-panel-structure"')
  expect(page).toContain('aria-labelledby="asset-view-tab-structure"')
  expect(page).toContain('id="asset-view-panel-list"')
  expect(page).toContain('aria-labelledby="asset-view-tab-list"')
  expect(page).toContain('role="tabpanel"')
  expect(page).toContain('hidden={state.tabSignal.get() !== "structure"}')
  expect(page).toContain('hidden={state.tabSignal.get() !== "list"}')
})

test("derives drop area values from the rendered chips and persists the move once on drag end", async () => {
  const attach = await readFile("src/ui/structure/uiStructureDropZoneAttach.ts", "utf8")

  // A separate value list desynchronises node and value counts during a pointer
  // drag, which triggers the library mismatch warning and skips the node remap.
  expect(attach).toContain("return options.assetIdsRead()")
  expect(attach).toContain("setValues: () => undefined")
  // Registration has to wait for the chips; see test/uiStructureDropZone.test.ts.
  expect(attach).toContain("onMount(() =>")
  expect(attach).not.toContain("createSignal<string[]>")
  // `onTransfer` fires for every crossed area, so only `onDragend` may persist.
  expect(attach).toContain("onDragend: (data) => {")
  expect(attach).toContain("const targetFolderId = folderIdByElement.get(data.parent.el)")
  expect(attach).toContain("options.assetMove(node.data.value, targetFolderId)")
  // Moving back to unassigned is a real target, so `null` must not be skipped.
  expect(attach).toContain("if (targetFolderId === undefined || targetFolderId === options.folderId) return")
  expect(attach).not.toContain("onTransfer: (data) => {")
})

test("keeps asset chips on one horizontal line on desktop and mobile", async () => {
  const chip = await readFile("src/ui/structure/UiStructureAssetChip.tsx", "utf8")

  // `wrap-anywhere` on the label broke long paths into a tall vertical chip.
  expect(chip).not.toContain("wrap-anywhere")
  expect(chip).toContain("flex-nowrap")
  expect(chip).toContain("min-w-0 flex-1 truncate")
  expect(chip).toContain("shrink-0")
})

test("applies the active URL filters to the structure asset request and cache key", async () => {
  const structureState = await readFile("src/ui/structure/uiAssetStructureStateCreate.ts", "utf8")
  const pageState = await readFile("src/ui/pages/uiAssetListPageStateCreate.ts", "utf8")

  expect(structureState).toContain("assetsReadAll(input.projectId(), input.filters())")
  expect(structureState).toContain('class=${filters.class ?? ""}')
  expect(structureState).toContain('folder=${filters.folder ?? ""}')
  expect(structureState).toContain('search=${filters.search ?? ""}')
  expect(pageState).toContain("filters: () => ({")
  expect(pageState).toContain("...(search() === undefined ? {} : { search: search() }),")
})

test("keeps the selected tab in every filter URL replacement", async () => {
  const pageState = await readFile("src/ui/pages/uiAssetListPageStateCreate.ts", "utf8")

  // A snapshot taken once would drop tab changes made while a debounced filter
  // replacement is still pending.
  expect(pageState).not.toContain("let pendingFilterSearchParams")
  expect(pageState).toContain("const pending = new URLSearchParams(window.location.search)")
  expect(pageState).toContain('tab: (nextTab ?? tab()) === "list" ? null : (nextTab ?? tab())')
  expect(pageState).toContain("setSearchParams({ ...filterUrlValuesRead(), tab: values.tab }, { replace: true })")
  expect(pageState).toContain("filtersUrlReplace(parsed.output)")
})
