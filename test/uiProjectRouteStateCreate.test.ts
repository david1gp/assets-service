import { expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"

import type { ProjectListItem } from "../src/api-client/projectListItemSchema.js"
import { uiSessionStore } from "../src/ui/session/uiSessionStore.js"

const routeParams = { orgSlug: "fixture-organization", projectSlug: "contentoren" }
const routeLocation = { pathname: "/orgs/fixture-organization/projects/contentoren/admin/assets" }
const projectsReadAllCalls: { includeArchived?: boolean }[] = []
const archivedProject = {
  id: "project-archived",
  organizationId: "organization-fixture",
  name: "Contentoren",
  slug: "contentoren",
  defaultEnvironment: "development" as const,
  archiveState: "archived" as const,
  organizationSlug: "fixture-organization",
  assetCount: 0,
  totalFileSize: 0,
  createdAt: "2026-08-17T09:00:00.000Z",
  updatedAt: "2026-08-17T09:00:00.000Z",
} satisfies ProjectListItem

mock.module("@solidjs/router", () => ({
  useNavigate: () => () => undefined,
  useLocation: () => routeLocation,
  useParams: () => routeParams,
  useSearchParams: () => [{}, () => {}],
}))

mock.module("../src/ui/client/uiApiClientRead.js", () => ({
  uiApiClientRead: () => ({
    success: true,
    data: {
      projectsReadAll: async (query: { includeArchived?: boolean }) => {
        projectsReadAllCalls.push(query)
        return { success: true as const, data: [archivedProject] }
      },
    },
  }),
}))

const { uiProjectRouteStateCreate } = await import("../src/ui/routing/uiProjectRouteStateCreate.js")

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

test("resolves an archived project from its canonical admin route", async () => {
  const previousSession = uiSessionStore.get()
  uiSessionStore.set({
    status: "authenticated",
    principal: {
      subjectId: "fixture-admin",
      organizationId: "organization-fixture",
      mode: "admin",
      organizationAdmin: true,
      method: "human_session",
      grants: [],
      issuedAt: 1,
      expiresAt: 2,
    },
    errorMessage: null,
  })
  projectsReadAllCalls.length = 0

  const { state, dispose } = createRoot((rootDispose) => ({ state: uiProjectRouteStateCreate(), dispose: rootDispose }))

  try {
    await flush()
    expect(projectsReadAllCalls).toEqual([{ includeArchived: true }])
    expect(state.projectQuery.data()).toEqual({
      id: archivedProject.id,
      organizationId: archivedProject.organizationId,
      name: archivedProject.name,
      slug: archivedProject.slug,
      defaultEnvironment: archivedProject.defaultEnvironment,
      archiveState: archivedProject.archiveState,
      createdAt: archivedProject.createdAt,
      updatedAt: archivedProject.updatedAt,
    })
  } finally {
    dispose()
    uiSessionStore.set(previousSession)
  }
})
