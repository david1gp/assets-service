import { expect, mock, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"

import type { ProjectListItem } from "../src/api-client/projectListItemSchema.js"
import type { ProjectListResponse } from "../src/api-client/projectListResponseSchema.js"
import type { Result } from "../src/schemas/resultSchema.js"
import { uiSessionStore } from "../src/ui/session/uiSessionStore.js"

type SearchParamValues = Record<string, string | undefined>

const [searchParamValues, searchParamValuesSet] = createSignal<SearchParamValues>({})
const searchParams = new Proxy<Record<string, string | undefined>>(
  {},
  { get: (_target, property) => searchParamValues()[String(property)] },
)
const searchParamsSet = (values: SearchParamValues) => {
  const next = { ...searchParamValues() }
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) delete next[key]
    else next[key] = value
  }
  searchParamValuesSet(next)
}

mock.module("@solidjs/router", () => ({
  useNavigate: () => () => undefined,
  useLocation: () => ({ pathname: "/projects" }),
  useParams: () => ({}),
  useSearchParams: () => [searchParams, searchParamsSet],
}))

const activeProject = {
  id: "project-1",
  organizationId: "org-1",
  name: "Example project",
  slug: "example-project",
  defaultEnvironment: "development" as const,
  organizationSlug: "example",
  assetCount: 0,
  totalFileSize: 0,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
} satisfies ProjectListItem

const archivedProject = {
  ...activeProject,
  id: "project-archived",
  name: "Archived project",
  slug: "archived-project",
  archiveState: "archived" as const,
} satisfies ProjectListItem

let projectsReadCalls: { cursor?: number; limit?: number; search?: string; includeArchived?: boolean }[] = []
let projectsReadAllCalls = 0
const projectListResult: Result<ProjectListResponse> = {
  success: true,
  data: { projects: [activeProject, archivedProject], page: { limit: 25, nextCursor: null } },
}

mock.module("../src/ui/client/uiApiClientRead.js", () => ({
  uiApiClientRead: () => ({
    success: true,
    data: {
      projectsRead: (query: { cursor?: number; limit?: number; search?: string; includeArchived?: boolean }) => {
        projectsReadCalls.push(query)
        return Promise.resolve(projectListResult)
      },
      projectsReadAll: () => {
        projectsReadAllCalls += 1
        return Promise.resolve({ success: true as const, data: projectListResult.data.projects })
      },
    },
  }),
}))

const { uiProjectListPageStateCreate } = await import("../src/ui/pages/uiProjectListPageStateCreate.js")

const browserLocation = { pathname: "/projects", search: "", hash: "" }
globalThis.window = {
  location: browserLocation,
  history: {
    state: null,
    replaceState: (_state: unknown, _title: string, url: string) => {
      browserLocation.search = new URL(url, "https://assets.example.test").search
    },
  },
} as unknown as Window & typeof globalThis

const sessionSet = (mode: "admin" | "contributor", organizationAdmin: boolean, roles: readonly string[]) => {
  uiSessionStore.set({
    status: "authenticated",
    principal: {
      subjectId: "subject-1",
      organizationId: mode === "admin" ? "org-1" : "org-customers",
      mode,
      organizationAdmin,
      method: "human_session",
      grants: [{ projectId: "zitadel-1", roles: roles as ("admin" | "contributor")[] }],
      issuedAt: 1,
      expiresAt: 2,
    },
    errorMessage: null,
  })
}

const stateCreate = (search: string) => {
  browserLocation.search = search
  searchParamValuesSet(Object.fromEntries(new URLSearchParams(search)))
  projectsReadCalls = []
  projectsReadAllCalls = 0
  return createRoot((dispose) => ({ state: uiProjectListPageStateCreate(), dispose }))
}

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const settleUrlChange = async () => {
  await new Promise((resolve) => setTimeout(resolve, 180))
  await flush()
}

test("keeps the administrator archived toggle off by default and backs it with the URL", async () => {
  const previousSession = uiSessionStore.get()
  sessionSet("admin", true, [])
  const { state, dispose } = stateCreate("?search=needle&cursor=10")

  try {
    await flush()
    expect(state.canShowArchived()).toBe(true)
    expect(state.includeArchived()).toBe(false)
    expect(projectsReadCalls).toContainEqual({ limit: 25, search: "needle", cursor: 10 })

    state.changeIncludeArchived(true)
    await settleUrlChange()

    expect(browserLocation.search).toBe("?search=needle&includeArchived=true")
    expect(state.includeArchived()).toBe(true)
    expect(projectsReadCalls).toContainEqual({ limit: 25, search: "needle", includeArchived: true })

    state.changeIncludeArchived(false)
    await settleUrlChange()

    expect(browserLocation.search).toBe("?search=needle")
    expect(state.includeArchived()).toBe(false)
  } finally {
    dispose()
    uiSessionStore.set(previousSession)
  }
})

test("does not honor archived URL state or render archived projects for contributors", async () => {
  const previousSession = uiSessionStore.get()
  sessionSet("contributor", false, ["contributor"])
  const { state, dispose } = stateCreate("?includeArchived=true")

  try {
    await flush()
    expect(state.canShowArchived()).toBe(false)
    expect(state.includeArchived()).toBe(false)
    expect(projectsReadCalls).toContainEqual({ limit: 25 })
    expect(projectsReadCalls.some((query) => query.includeArchived === true)).toBe(false)
    expect(projectsReadAllCalls).toBe(1)
    expect(state.query.data()?.projects.map((project) => project.id)).toEqual(["project-1"])
  } finally {
    dispose()
    uiSessionStore.set(previousSession)
  }
})
