import { describe, expect, test } from "bun:test"
import { uiAuditActionSelectionUpdate } from "../src/ui/pages/uiAuditActionSelectionUpdate.js"

describe("uiAuditActionSelectionUpdate", () => {
  test("selecting an individual action removes virtual all", () => {
    expect(uiAuditActionSelectionUpdate(["all"], ["all", "asset.deleted"])).toEqual(["asset.deleted"])
  })

  test("selecting all clears individual actions", () => {
    expect(
      uiAuditActionSelectionUpdate(["asset.created", "asset.deleted"], ["all", "asset.created", "asset.deleted"]),
    ).toEqual(["all"])
  })

  test("an empty selection returns to all", () => {
    expect(uiAuditActionSelectionUpdate(["asset.deleted"], [])).toEqual(["all"])
  })

  test("preserves multiple individual actions", () => {
    expect(uiAuditActionSelectionUpdate(["asset.created"], ["asset.created", "asset.deletion_requested"])).toEqual([
      "asset.created",
      "asset.deletion_requested",
    ])
  })
})
