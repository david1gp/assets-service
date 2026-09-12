import { expect, test } from "bun:test"

import { uiProjectListContributorRedirectProjectIdRead } from "../src/ui/pages/uiProjectListContributorRedirectProjectIdRead.js"

const project = (id: string) => ({ id }) as never

test("returns the sole project only for an unfiltered contributor result", () => {
  expect(
    uiProjectListContributorRedirectProjectIdRead({
      mode: "contributor",
      search: undefined,
      cursor: undefined,
      projects: [project("project-1")],
    }),
  ).toBe("project-1")
})

test("preserves contributor project selection for zero or multiple projects", () => {
  for (const projects of [[], [project("project-1"), project("project-2")]]) {
    expect(
      uiProjectListContributorRedirectProjectIdRead({
        mode: "contributor",
        search: undefined,
        cursor: undefined,
        projects,
      }),
    ).toBe(null)
  }
})

test("preserves admin selection and filtered or paginated contributor selection", () => {
  const projects = [project("project-1")]
  expect(
    uiProjectListContributorRedirectProjectIdRead({
      mode: "admin",
      search: undefined,
      cursor: undefined,
      projects,
    }),
  ).toBe(null)
  expect(
    uiProjectListContributorRedirectProjectIdRead({
      mode: "contributor",
      search: "one",
      cursor: undefined,
      projects,
    }),
  ).toBe(null)
  expect(
    uiProjectListContributorRedirectProjectIdRead({
      mode: "contributor",
      search: undefined,
      cursor: 100,
      projects,
    }),
  ).toBe(null)
})

test("does not redirect contributors to an archived project", () => {
  expect(
    uiProjectListContributorRedirectProjectIdRead({
      mode: "contributor",
      search: undefined,
      cursor: undefined,
      projects: [{ id: "project-1", archiveState: "archived" }] as never,
    }),
  ).toBe(null)
})
