import { readFile } from "node:fs/promises"
import { describe, expect, test } from "bun:test"

const jobsPageSource = await readFile("src/ui/pages/UiJobsPage.tsx", "utf8")

describe("jobs page structure", () => {
  test("renders an asset link using uiPaths.admin.asset when assetId is present", () => {
    expect(jobsPageSource).toContain("<Show when={job.assetId}>")
    expect(jobsPageSource).toContain("uiPaths.admin.asset(state.projectId(), assetId())")
  })

  test("keeps retry and cancel job actions intact", () => {
    expect(jobsPageSource).toContain("state.jobRetry(job.id)")
    expect(jobsPageSource).toContain("state.jobCancel(job.id)")
  })
})
