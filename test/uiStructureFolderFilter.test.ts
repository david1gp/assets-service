import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import type { AssetListItem } from "../src/api-client/assetListItemSchema.js"
import { uiStructureAssetFolderSelectStateCreate } from "../src/ui/structure/uiStructureAssetFolderSelectStateCreate.js"
import {
  uiAssetFolderFilterAllValue,
  uiAssetFolderFilterOptionsRead,
} from "../src/ui/pages/uiAssetFolderFilterOptionsRead.js"
import { uiAssetFolderPathsRead } from "../src/ui/pages/uiAssetFolderPathsRead.js"

const assetCreate = (id: string, folders: string[]): AssetListItem =>
  ({
    id,
    projectId: "project-1",
    class: "image",
    folders,
    filename: `${id}.jpg`,
    basename: id,
    currentSourceRevisionId: `source-${id}`,
    sourcePath: `/${folders.join("/")}/${id}.jpg`,
    outputCount: 0,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:00.000Z",
  }) as AssetListItem

test("flattens canonical asset folders and parent paths into sorted full paths", () => {
  const paths = uiAssetFolderPathsRead([
    assetCreate("small", ["brand", "logos", "small"]),
    assetCreate("logo", ["brand", "logos"]),
    assetCreate("archive", ["archive"]),
  ])

  expect(paths).toEqual(["archive", "brand", "brand/logos", "brand/logos/small"])
})

test("offers an all-folders entry ahead of every folder path", () => {
  const options = uiAssetFolderFilterOptionsRead(["brand", "brand/logos"], uiAssetFolderFilterAllValue)

  expect(options).toEqual(["", "brand", "brand/logos"])
})

test("keeps a stale folder filter selectable so it stays representable and clearable", () => {
  const options = uiAssetFolderFilterOptionsRead(["brand"], "removed/folder")

  expect(options).toEqual(["", "brand", "removed/folder"])
  // Clearing back to the all-folders entry must always remain reachable.
  expect(options[0]).toBe(uiAssetFolderFilterAllValue)
})

test("does not duplicate a folder filter that still exists", () => {
  expect(uiAssetFolderFilterOptionsRead(["brand", "brand/logos"], "brand/logos")).toEqual(["", "brand", "brand/logos"])
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

  expect(page).toContain('<SelectSingleNative\n                id="asset-folder"')
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

test("omits list folder columns and prefixes when folders are hidden while retaining asset links", async () => {
  const page = await readFile("src/ui/pages/UiAssetListPage.tsx", "utf8")

  expect(page).toContain("showFolders: () => boolean")
  expect(page).toContain(
    "data: (asset) => (showFolders() ? uiAssetPathFormat(asset.folders, asset.filename) : asset.filename)",
  )
  expect(page).toContain("const hasFolders = () => showFolders() && asset.folders.length > 0")
  expect(page).toContain("if (showFolders()) {")
  expect(page).toContain('id: "structureFolder"')
  expect(page.indexOf('id: "structureFolder"')).toBeGreaterThan(page.indexOf("if (showFolders()) {"))
  expect(page).toContain("href={uiPaths.asset(projectId(), asset.id)}")
})

test("drops the active folder filter when folders get hidden", async () => {
  const pageState = await readFile("src/ui/pages/uiAssetListPageStateCreate.ts", "utf8")

  expect(pageState).toContain("if (!enabled) folderClear()")
  expect(pageState).toContain("if (!showFolders.get() && folder() !== undefined) folderClear()")
  expect(pageState).toContain("isFolderAssignmentVisible: () => showFolders.get() && showFolderAssignment.get()")
  expect(pageState).toContain("uiAssetFolderFilterOptionsRead(folderPaths.paths(), folderDraftState.get())")
})

test("hides folder sections, creation, and assignment selects in the structure view", async () => {
  const view = await readFile("src/ui/structure/UiAssetStructureView.tsx", "utf8")
  const chip = await readFile("src/ui/structure/UiStructureAssetChip.tsx", "utf8")

  expect(view).toContain("<Show when={p.showFolders()}")
  expect(view).toContain("uiStructureTreeAssetsRead(p.state.tree())")
  expect(chip).toContain("<Show when={p.showFolderAssignment()}>")
  expect(chip).toContain("<Show when={p.showFolders()}>")
  expect(chip).toContain("const hasFolders = () => p.showFolders() && p.asset.folders.length > 0")
  expect(chip).toContain(
    "const label = () => (p.showFolders() ? uiAssetPathFormat(p.asset.folders, p.asset.filename) : p.asset.filename)",
  )
})
