import { expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"

import { createSignalObject } from "#ui/utils/createSignalObject.js"
import type { Project } from "../src/project/projectSchema.js"
import type { Result } from "../src/schemas/resultSchema.js"
import { uiSessionStore } from "../src/ui/session/uiSessionStore.js"

const pathname = createSignalObject("/projects/project-1/assets")
const routeProjectId = createSignalObject<string | undefined>(undefined)
const projectReadCalls: string[] = []
let projectReadImplementation = (_projectId: string): Promise<Result<Project>> =>
  Promise.resolve({ success: true, data: projectCreate() })

mock.module("@solidjs/router", () => ({
  useLocation: () => ({
    get pathname() {
      return pathname.get()
    },
  }),
  useNavigate: () => () => {},
  useParams: () => ({
    get projectId() {
      return routeProjectId.get()
    },
  }),
}))

mock.module("../src/ui/client/uiApiClientRead.js", () => ({
  uiApiClientRead: () => ({
    success: true,
    data: {
      projectRead: (projectId: string) => {
        projectReadCalls.push(projectId)
        return projectReadImplementation(projectId)
      },
    },
  }),
}))

const { uiShellStateCreate } = await import("../src/ui/shell/uiShellStateCreate.js")

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
} as unknown as Window & typeof globalThis

const projectCreate = (name = "Project One"): Project => ({
  id: "project-1",
  organizationId: "organization-1",
  name,
  slug: "project-one",
  defaultEnvironment: "production",
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
})

const sessionSet = (displayName?: string) => {
  uiSessionStore.set({
    status: "authenticated",
    principal: {
      subjectId: "subject-1",
      ...(displayName === undefined ? {} : { displayName }),
      organizationId: "organization-1",
      organizationAdmin: false,
      method: "human_session",
      grants: [{ projectId: "project-1", roles: ["admin"] }],
      issuedAt: 1,
      expiresAt: 2,
    },
    errorMessage: null,
  })
}

const stateCreate = (currentPathname: string, currentProjectId?: string) => {
  pathname.set(currentPathname)
  routeProjectId.set(currentProjectId)
  return createRoot((dispose) => ({ state: uiShellStateCreate(), dispose }))
}

test("loads project metadata without blocking shell state", async () => {
  const previousSession = uiSessionStore.get()
  let resolveProject: ((result: Result<Project>) => void) | undefined
  projectReadImplementation = () =>
    new Promise((resolve) => {
      resolveProject = resolve
    })
  projectReadCalls.length = 0
  sessionSet()

  try {
    const { state, dispose } = stateCreate("/projects/project-1/assets")
    await flush()

    expect(projectReadCalls).toEqual(["project-1"])
    expect(state.projectId()).toBe("project-1")
    expect(state.links().length).toBeGreaterThan(0)
    expect(state.projectQuery.status()).toBe("loading")

    resolveProject?.({ success: true, data: projectCreate() })
    await flush()

    expect(state.projectQuery.status()).toBe("ready")
    expect(state.projectQuery.data()?.name).toBe("Project One")
    dispose()
  } finally {
    uiSessionStore.set(previousSession)
  }
})

test("does not read project metadata without a project ID", async () => {
  const previousSession = uiSessionStore.get()
  projectReadCalls.length = 0
  projectReadImplementation = () => Promise.resolve({ success: true, data: projectCreate() })
  sessionSet()

  try {
    const { state, dispose } = stateCreate("/login")
    await flush()

    expect(projectReadCalls).toEqual([])
    expect(state.projectQuery.status()).toBe("ready")
    expect(state.projectQuery.data()).toBeNull()
    dispose()
  } finally {
    uiSessionStore.set(previousSession)
  }
})

test("waits for an authenticated session before reading project metadata", async () => {
  const previousSession = uiSessionStore.get()
  projectReadCalls.length = 0
  projectReadImplementation = () => Promise.resolve({ success: true, data: projectCreate() })
  uiSessionStore.set({ status: "anonymous", principal: null, errorMessage: null })

  try {
    const { state, dispose } = stateCreate("/projects/project-1/assets")
    await flush()

    expect(projectReadCalls).toEqual([])
    expect(state.projectQuery.data()).toBeNull()
    expect(state.projectName()).toBe("")
    dispose()
  } finally {
    uiSessionStore.set(previousSession)
  }
})

test("keeps project metadata failures in query state", async () => {
  const previousSession = uiSessionStore.get()
  projectReadCalls.length = 0
  projectReadImplementation = () => Promise.resolve({ success: false, op: "projectRead", errorMessage: "not found" })
  sessionSet()

  try {
    const { state, dispose } = stateCreate("/projects/project-1/assets")
    await flush()

    expect(state.projectId()).toBe("project-1")
    expect(state.projectQuery.status()).toBe("error")
    expect(state.projectQuery.errorMessage()).toBe("not found")
    expect(state.projectName()).toBe("")
    expect(state.links().length).toBeGreaterThan(0)
    dispose()
  } finally {
    uiSessionStore.set(previousSession)
  }
})

test("exposes project and account labels for the shell header", async () => {
  const previousSession = uiSessionStore.get()
  projectReadCalls.length = 0
  projectReadImplementation = () => Promise.resolve({ success: true, data: projectCreate() })
  sessionSet("Ada Lovelace")

  try {
    const { state, dispose } = stateCreate("/projects/project-1/assets")
    await flush()

    expect(state.projectName()).toBe("Project One")
    expect(state.projectId()).toBe("project-1")
    expect(state.accountName()).toBe("Ada Lovelace")
    expect(state.accountId()).toBe("subject-1")
    dispose()
  } finally {
    uiSessionStore.set(previousSession)
  }
})

test("falls back to the subject ID for principals without a display name", async () => {
  const previousSession = uiSessionStore.get()
  projectReadCalls.length = 0
  projectReadImplementation = () => Promise.resolve({ success: true, data: projectCreate() })
  sessionSet()

  try {
    const { state, dispose } = stateCreate("/projects/project-1/assets")
    await flush()

    expect(state.accountName()).toBe("")
    expect(state.accountId()).toBe("subject-1")
    dispose()
  } finally {
    uiSessionStore.set(previousSession)
  }
})
