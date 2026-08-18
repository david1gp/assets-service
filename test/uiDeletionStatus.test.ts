import { describe, expect, test } from "bun:test"

import type { DeletionState } from "../src/deletion/deletionStateSchema.js"
import { uiDeletionProgressRead } from "../src/ui/deletion/uiDeletionProgressRead.js"
import { uiDeletionStatusDetailRead } from "../src/ui/deletion/uiDeletionStatusDetailRead.js"
import { uiDeletionStatusLabelRead } from "../src/ui/deletion/uiDeletionStatusLabelRead.js"
import { uiDeletionStatusToneRead } from "../src/ui/deletion/uiDeletionStatusToneRead.js"

const stateCreate = (overrides: Partial<DeletionState> = {}): DeletionState => ({
  id: "deletion-asset-hero",
  assetId: "asset-hero",
  status: "requested",
  completedSteps: [],
  pendingRemoteObjects: [],
  requestedAt: "2026-08-17T09:00:00.000Z",
  updatedAt: "2026-08-17T09:00:00.000Z",
  ...overrides,
})

describe("uiDeletionStatusLabelRead", () => {
  test("never calls a pending deletion finished", () => {
    expect(uiDeletionStatusLabelRead("requested")).toBe("Deletion requested")
    expect(uiDeletionStatusLabelRead("in_progress")).toBe("Deletion running")
    expect(uiDeletionStatusLabelRead("retryable")).toBe("Deletion retrying")
    expect(uiDeletionStatusLabelRead("failed")).toBe("Deletion failed")
    expect(uiDeletionStatusLabelRead("succeeded")).toBe("Deleted")
  })
})

describe("uiDeletionStatusToneRead", () => {
  test("only reports success once the workflow finished", () => {
    expect(uiDeletionStatusToneRead("requested")).toBe("neutral")
    expect(uiDeletionStatusToneRead("in_progress")).toBe("neutral")
    expect(uiDeletionStatusToneRead("retryable")).toBe("neutral")
    expect(uiDeletionStatusToneRead("succeeded")).toBe("positive")
    expect(uiDeletionStatusToneRead("failed")).toBe("negative")
  })
})

describe("uiDeletionProgressRead", () => {
  test("reports zero progress and says the asset is still in place when queued", () => {
    const progress = uiDeletionProgressRead(stateCreate({ pendingRemoteObjects: ["a", "b"] }))
    expect(progress.percent).toBe(0)
    expect(progress.completedSteps).toBe(0)
    expect(progress.totalSteps).toBe(6)
    expect(progress.label).toContain("0 of 6 steps done")
    expect(progress.label).toContain("still in place")
  })

  test("reports step counts and remote-object counts as separate numbers", () => {
    const progress = uiDeletionProgressRead(
      stateCreate({
        status: "in_progress",
        completedSteps: ["plan:remote-objects", "remote:contentoren/images/hero.webp"],
        pendingRemoteObjects: ["contentoren/images/hero.avif"],
      }),
    )
    expect(progress.totalSteps).toBe(6)
    expect(progress.completedSteps).toBe(2)
    expect(progress.removedObjects).toBe(1)
    expect(progress.pendingObjects).toBe(1)
    expect(progress.percent).toBe(33)
    expect(progress.label).toBe("2 of 6 steps done, 1 of 2 remote objects removed, 1 remote object left.")
  })

  test("never claims full progress while remote objects are pending", () => {
    const progress = uiDeletionProgressRead(
      stateCreate({
        status: "in_progress",
        completedSteps: ["plan:remote-objects", "database:catalog", "database:records", "database:asset"],
        pendingRemoteObjects: ["one", "two"],
      }),
    )
    expect(progress.percent).toBeLessThan(100)
    expect(progress.pendingObjects).toBe(2)
  })

  test("says it is retrying after a failed attempt", () => {
    const progress = uiDeletionProgressRead(
      stateCreate({ status: "retryable", completedSteps: ["plan:remote-objects"] }),
    )
    expect(progress.label).toContain("Retrying after a failure.")
  })

  test("reports a full removal only when succeeded", () => {
    expect(uiDeletionProgressRead(stateCreate({ status: "succeeded" })).percent).toBe(100)
    const failed = uiDeletionProgressRead(
      stateCreate({ status: "failed", completedSteps: ["plan:remote-objects"], pendingRemoteObjects: ["one"] }),
    )
    expect(failed.label).toContain("stopped after 1 of 5 steps")
    expect(failed.label).toContain("1 remote object left")
  })
})

describe("uiDeletionStatusDetailRead", () => {
  test("shows the request time while pending and the completion time when done", () => {
    expect(uiDeletionStatusDetailRead(stateCreate())).toBe("requested 2026-08-17 09:00 UTC")
    expect(
      uiDeletionStatusDetailRead(stateCreate({ status: "succeeded", completedAt: "2026-08-17T10:30:00.000Z" })),
    ).toBe("completed 2026-08-17 10:30 UTC")
  })
})
