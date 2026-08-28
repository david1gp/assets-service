import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import type { StructureFolder } from "../src/structure/structureFolderSchema.js"
import {
  uiStructureFolderFilterAllValue,
  uiStructureFolderFilterOptionsRead,
} from "../src/ui/structure/uiStructureFolderFilterOptionsRead.js"
import { uiStructureFolderPathsRead } from "../src/ui/structure/uiStructureFolderPathsRead.js"
import { uiStructureAssetFolderSelectStateCreate } from "../src/ui/structure/uiStructureAssetFolderSelectStateCreate.js"

const folderCreate = (id: string, name: string, parentId: string | null, depth: 1 | 2 | 3): StructureFolder => ({
  id,
  projectId: "project-1",
  parentId,
  name,
  depth,
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
})

test("flattens nested folders into sorted full paths", () => {
  const paths = uiStructureFolderPathsRead([
    folderCreate("grand", "small", "child", 3),
    folderCreate("child", "logos", "root-b", 2),
    folderCreate("root-b", "brand", null, 1),
    folderCreate("root-a", "archive", null, 1),
  ])

  expect(paths).toEqual(["archive", "brand", "brand/logos", "brand/logos/small"])
})

test("offers an all-folders entry ahead of every folder path", () => {
  const options = uiStructureFolderFilterOptionsRead(["brand", "brand/logos"], uiStructureFolderFilterAllValue)

  expect(options).toEqual(["", "brand", "brand/logos"])
})

test("keeps a stale folder filter selectable so it stays representable and clearable", () => {
  const options = uiStructureFolderFilterOptionsRead(["brand"], "removed/folder")

  expect(options).toEqual(["", "brand", "removed/folder"])
  // Clearing back to the all-folders entry must always remain reachable.
  expect(options[0]).toBe(uiStructureFolderFilterAllValue)
})

test("does not duplicate a folder filter that still exists", () => {
  expect(uiStructureFolderFilterOptionsRead(["brand", "brand/logos"], "brand/logos")).toEqual([
    "",
    "brand",
    "brand/logos",
  ])
})

test("builds the shared assignment options and sends unassigned as null", () => {
  const folderId = { current: "folder-child" }
  const moves: Array<{ assetId: string; folderId: string | null }> = []
  const state = uiStructureAssetFolderSelectStateCreate({
    assetId: () => "asset-1",
    folderId: () => folderId.current,
    folderOptions: () => [
      { id: "folder-root", path: "brand", depth: 1 },
      { id: "folder-child", path: "brand/logos", depth: 2 },
    ],
    isDisabled: () => false,
    assetMove: (assetId, nextFolderId) => moves.push({ assetId, folderId: nextFolderId }),
  })

  expect(state.optionValues()).toEqual(["unassigned", "folder-root", "folder-child"])
  expect(state.optionText("folder-child")).toBe("brand/logos")
  expect(state.valueSignal.get()).toBe("folder-child")

  state.valueSignal.set("unassigned")
  expect(moves).toEqual([{ assetId: "asset-1", folderId: null }])
})

test("replaces the free-text folder filter with a flat folder select", async () => {
  const page = await readFile("src/ui/pages/UiAssetListPage.tsx", "utf8")

  expect(page).toContain('<SelectSingleNative\n                  id="asset-folder"')
  expect(page).toContain("getOptions={state.folderOptions}")
  expect(page).toContain('valueText={(value) => (value === "" ? "All folders" : value)}')
  expect(page).not.toContain('<InputS id="asset-folder"')
})

test("hides the folder filter and assignment toggle when folders are hidden", async () => {
  const page = await readFile("src/ui/pages/UiAssetListPage.tsx", "utf8")

  // The folder filter must disappear together with every other folder affordance.
  expect(page).toContain("<Show when={state.showFolders.get()}>")
  expect(page).toContain("pressedSignal={state.showFolders}")
  expect(page).toContain("pressedSignal={state.showFolderAssignment}")
  expect(page).toContain("showFolderAssignment={state.isFolderAssignmentVisible}")
})

test("adds list assignment controls only when the shared assignment option is visible", async () => {
  const page = await readFile("src/ui/pages/UiAssetListPage.tsx", "utf8")
  const pageState = await readFile("src/ui/pages/uiAssetListPageStateCreate.ts", "utf8")
  const structureState = await readFile("src/ui/structure/uiAssetStructureStateCreate.ts", "utf8")

  expect(page).toContain('id: "structureFolder"')
  expect(page).toContain("<UiStructureAssetFolderSelect")
  expect(page).toContain("folderOptions={structure.folderOptions}")
  expect(page).toContain("!structure.isReady() || structure.pendingAssetIds().has(asset.id)")
  expect(pageState).toContain(
    'isActive: () => tab() === "structure" || (showFolders.get() && showFolderAssignment.get())',
  )
  expect(structureState).toContain("assetFolderIdRead")
})

test("drops the active folder filter when folders get hidden", async () => {
  const pageState = await readFile("src/ui/pages/uiAssetListPageStateCreate.ts", "utf8")

  expect(pageState).toContain("if (!enabled) folderClear()")
  expect(pageState).toContain("isFolderAssignmentVisible: () => showFolders.get() && showFolderAssignment.get()")
  expect(pageState).toContain("uiStructureFolderFilterOptionsRead(folderPaths.paths(), folderDraftState.get())")
})

test("hides folder sections, creation, and assignment selects in the structure view", async () => {
  const view = await readFile("src/ui/structure/UiAssetStructureView.tsx", "utf8")
  const chip = await readFile("src/ui/structure/UiStructureAssetChip.tsx", "utf8")

  expect(view).toContain("<Show when={p.showFolders()}")
  expect(view).toContain("uiStructureTreeAssetsRead(p.state.tree())")
  expect(chip).toContain("<Show when={p.showFolderAssignment()}>")
  expect(chip).toContain("<Show when={p.showFolders()}>")
})
