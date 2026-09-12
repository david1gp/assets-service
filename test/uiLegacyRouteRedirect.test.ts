import { expect, mock, test } from "bun:test"
import { Window } from "happy-dom"

import type { Project } from "../src/project/projectSchema.js"
import { uiSessionStore } from "../src/ui/session/uiSessionStore.js"

const project: Project = {
  id: "project-fixture",
  organizationId: "org-fixture",
  name: "Contentoren",
  slug: "contentoren",
  defaultEnvironment: "development",
  createdAt: "2026-08-17T09:00:00.000Z",
  updatedAt: "2026-08-17T09:00:00.000Z",
}

const projectListItem = {
  ...project,
  organizationSlug: "fixture-organization",
  assetCount: 1,
  totalFileSize: 1,
}

mock.module("../src/ui/client/uiApiClientRead.js", () => ({
  uiApiClientRead: () => ({
    success: true,
    data: {
      projectRead: async () => ({ success: true, data: project }),
      authOrganizationsRead: async () => ({
        success: true,
        data: {
          organizations: [
            {
              id: "org-fixture-customers",
              name: "Fixture customers",
              current: true,
              mode: "contributor",
              organizationAdmin: false,
            },
          ],
          currentOrganizationId: "org-fixture-customers",
        },
      }),
      projectsReadAll: async () => ({ success: true, data: [projectListItem] }),
    },
  }),
}))

const globals = globalThis as unknown as Record<string, unknown>

const browserGlobalsSet = (browserWindow: Window) => {
  globals.window = browserWindow
  globals.document = browserWindow.document
  globals.history = browserWindow.history
  globals.location = browserWindow.location
  globals.localStorage = browserWindow.localStorage
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
    const value = (browserWindow as unknown as Record<string, unknown>)[key]
    if (value !== undefined) globals[key] = value
  }
}

browserGlobalsSet(new Window({ url: "http://assets.test/projects/project-fixture/contributor/assets" }))

const solidWebBrowser = await import("solid-js/web/dist/dev.js" as string)
mock.module("solid-js/web", () => solidWebBrowser)

const { createComponent, createEffect } = await import("solid-js")
const { render } = await import("solid-js/web")
const { Route, Router, useNavigate } = await import("@solidjs/router")
const { uiLegacyRouteRedirectStateCreate } = await import("../src/ui/routing/uiLegacyRouteRedirectStateCreate.js")

const legacyRouteRedirect = () => {
  const state = uiLegacyRouteRedirectStateCreate()
  const navigate = useNavigate()
  createEffect(() => {
    const target = state.target()
    if (target !== undefined) navigate(target, { replace: true })
  })
  return "not found"
}

const sessionSet = () => {
  uiSessionStore.set({
    status: "authenticated",
    principal: {
      subjectId: "fixture-admin",
      organizationId: "org-fixture-customers",
      mode: "contributor",
      organizationAdmin: false,
      method: "human_session",
      grants: [{ projectId: "zitadel-fixture", roles: ["contributor"] }],
      issuedAt: 1,
      expiresAt: 2,
    },
    errorMessage: null,
  })
}

const flush = async () => {
  for (let index = 0; index < 5; index += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 20))
}

const legacyRouteNavigateRead = async (path: string) => {
  const browserWindow = new Window({ url: `http://assets.test${path}` })
  browserGlobalsSet(browserWindow)
  sessionSet()
  const root = browserWindow.document.createElement("div")
  browserWindow.document.body.appendChild(root)
  const dispose = render(
    () =>
      createComponent(Router, {
        get children() {
          return [
            createComponent(Route, {
              path: "/projects/:projectId/contributor/assets",
              component: legacyRouteRedirect,
            }),
            createComponent(Route, {
              path: "/projects/:projectId/contributor/assets/:assetId",
              component: legacyRouteRedirect,
            }),
            createComponent(Route, {
              path: "/orgs/:orgSlug/projects/:projectSlug/contributor/assets",
              component: () => "canonical-list",
            }),
            createComponent(Route, {
              path: "/orgs/:orgSlug/projects/:projectSlug/contributor/assets/:assetId",
              component: () => "canonical-detail",
            }),
          ]
        },
      }),
    root as unknown as Node,
  )
  await flush()
  const pathname = browserWindow.location.pathname
  const text = root.textContent
  dispose()
  return { pathname, text }
}

test("redirects legacy contributor list and nested asset routes through the actual router", async () => {
  const list = await legacyRouteNavigateRead("/projects/project-fixture/contributor/assets")
  expect(list).toEqual({
    pathname: "/orgs/fixture-organization/projects/contentoren/contributor/assets",
    text: "canonical-list",
  })

  const detail = await legacyRouteNavigateRead("/projects/project-fixture/contributor/assets/asset-hero")
  expect(detail).toEqual({
    pathname: "/orgs/fixture-organization/projects/contentoren/contributor/assets/asset-hero",
    text: "canonical-detail",
  })
})
