import { describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import type { Result } from "../src/schemas/resultSchema.js"
import type { AuthOrganizationsResponse } from "../src/api-client/authOrganizationsResponseSchema.js"
import type { AuthOrganizationSwitchResponse } from "../src/api-client/authOrganizationSwitchResponseSchema.js"
import { uiTenantCacheClear } from "../src/ui/organization/uiTenantCacheClear.js"
import { uiSessionStore } from "../src/ui/session/uiSessionStore.js"
import { uiToastStore } from "../src/ui/toast/uiToastStore.js"

let navigatedTo: string | null = null
let navigateOptions: unknown = null

mock.module("@solidjs/router", () => ({
  useNavigate: () => (to: string, options: unknown) => {
    navigatedTo = to
    navigateOptions = options
  },
  useLocation: () => ({ pathname: "/" }),
  useParams: () => ({}),
  useSearchParams: () => [{}, () => {}],
}))

let organizationsReadResult: Result<AuthOrganizationsResponse> = {
  success: true,
  data: {
    organizations: [
      { id: "org-contentoren", name: "Contentoren", current: true, mode: "admin", organizationAdmin: true },
      { id: "org-david", name: "David", current: false, mode: "admin", organizationAdmin: true },
    ],
    currentOrganizationId: "org-contentoren",
  },
}
let organizationsReadImplementation = () => Promise.resolve(organizationsReadResult)

let organizationSwitchResult: Result<AuthOrganizationSwitchResponse> = {
  success: true,
  data: {
    switched: true,
    organizationId: "org-david",
    principal: {
      subjectId: "david-1",
      displayName: "David",
      organizationId: "org-david",
      mode: "admin",
      organizationAdmin: true,
      method: "human_session",
      grants: [],
      issuedAt: 100,
      expiresAt: 200,
    },
  },
}

const switchCalls: string[] = []

mock.module("../src/ui/client/uiApiClientRead.js", () => ({
  uiApiClientRead: () => ({
    success: true,
    data: {
      authOrganizationsRead: () => organizationsReadImplementation(),
      authOrganizationSwitch: (organizationId: string) => {
        switchCalls.push(organizationId)
        return Promise.resolve(organizationSwitchResult)
      },
    },
  }),
}))

const { uiOrganizationSelectorStateCreate } = await import(
  "../src/ui/organization/uiOrganizationSelectorStateCreate.js"
)

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe("uiTenantCacheClear", () => {
  test("removes ui-cache and ui-draft entries while preserving other localStorage items", () => {
    const memory = new Map<string, string>()
    const fakeStorage: Storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
      clear: () => memory.clear(),
      get length() {
        return memory.size
      },
      key: (index: number) => Array.from(memory.keys())[index] ?? null,
    }

    fakeStorage.setItem("assets-service:ui-cache:project:1", JSON.stringify({ id: "1" }))
    fakeStorage.setItem("assets-service:ui-cache:assets:all", JSON.stringify([]))
    fakeStorage.setItem("assets-service:ui-draft:form:1", JSON.stringify({ draft: true }))
    fakeStorage.setItem("assets-service:ui-language", "de")
    fakeStorage.setItem("assets-service:ui-theme", "dark")

    uiTenantCacheClear(fakeStorage)

    expect(fakeStorage.getItem("assets-service:ui-cache:project:1")).toBeNull()
    expect(fakeStorage.getItem("assets-service:ui-cache:assets:all")).toBeNull()
    expect(fakeStorage.getItem("assets-service:ui-draft:form:1")).toBeNull()
    expect(fakeStorage.getItem("assets-service:ui-language")).toBe("de")
    expect(fakeStorage.getItem("assets-service:ui-theme")).toBe("dark")
  })
})

describe("uiOrganizationSelectorStateCreate", () => {
  test("does not expose the organization ID as a label while the name is loading", async () => {
    const previousSession = uiSessionStore.get()
    let resolveOrganizations: ((result: Result<AuthOrganizationsResponse>) => void) | undefined
    organizationsReadImplementation = () =>
      new Promise((resolve) => {
        resolveOrganizations = resolve
      })
    uiSessionStore.set({
      status: "authenticated",
      principal: {
        subjectId: "user-loading",
        organizationId: "12345",
        mode: "admin",
        organizationAdmin: true,
        method: "human_session",
        grants: [],
        issuedAt: 100,
        expiresAt: 200,
      },
      errorMessage: null,
    })

    try {
      const { state, dispose } = createRoot((d) => ({
        state: uiOrganizationSelectorStateCreate(),
        dispose: d,
      }))

      await flush()

      expect(state.currentOrganizationId()).toBe("12345")
      expect(state.currentOrganizationName()).toBe("")
      expect(state.showLabel()).toBe(false)

      resolveOrganizations?.({
        success: true,
        data: {
          organizations: [
            { id: "12345", name: "Loading Organization", current: true, mode: "admin", organizationAdmin: true },
          ],
          currentOrganizationId: "12345",
        },
      })
      await flush()

      expect(state.currentOrganizationName()).toBe("Loading Organization")
      expect(state.showLabel()).toBe(true)
      dispose()
    } finally {
      organizationsReadImplementation = () => Promise.resolve(organizationsReadResult)
      uiSessionStore.set(previousSession)
    }
  })

  test("shows selector when user has more than 1 organization", async () => {
    uiSessionStore.set({
      status: "authenticated",
      principal: {
        subjectId: "david-1",
        organizationId: "org-contentoren",
        mode: "admin",
        organizationAdmin: true,
        method: "human_session",
        grants: [],
        issuedAt: 100,
        expiresAt: 200,
      },
      errorMessage: null,
    })

    organizationsReadResult = {
      success: true,
      data: {
        organizations: [
          { id: "org-contentoren", name: "Contentoren", current: true, mode: "admin", organizationAdmin: true },
          { id: "org-david", name: "David", current: false, mode: "admin", organizationAdmin: true },
        ],
        currentOrganizationId: "org-contentoren",
      },
    }

    const { state, dispose } = createRoot((d) => ({
      state: uiOrganizationSelectorStateCreate(),
      dispose: d,
    }))

    await flush()

    expect(state.currentOrganizationId()).toBe("org-contentoren")
    expect(state.currentOrganizationName()).toBe("Contentoren")
    expect(state.showSelector()).toBe(true)
    expect(state.showLabel()).toBe(false)
    expect(state.organizations()).toHaveLength(2)

    dispose()
  })

  test("shows only label when user has 1 organization", async () => {
    uiSessionStore.set({
      status: "authenticated",
      principal: {
        subjectId: "user-single",
        organizationId: "org-fabian",
        mode: "admin",
        organizationAdmin: true,
        method: "human_session",
        grants: [],
        issuedAt: 100,
        expiresAt: 200,
      },
      errorMessage: null,
    })

    organizationsReadResult = {
      success: true,
      data: {
        organizations: [{ id: "org-fabian", name: "Fabian", current: true, mode: "admin", organizationAdmin: true }],
        currentOrganizationId: "org-fabian",
      },
    }

    const { state, dispose } = createRoot((d) => ({
      state: uiOrganizationSelectorStateCreate(),
      dispose: d,
    }))

    await flush()

    expect(state.currentOrganizationId()).toBe("org-fabian")
    expect(state.currentOrganizationName()).toBe("Fabian")
    expect(state.showSelector()).toBe(false)
    expect(state.showLabel()).toBe(true)
    expect(state.organizations()).toHaveLength(1)

    dispose()
  })

  test("switches organization, updates session store, clears cache, and navigates to projects", async () => {
    uiSessionStore.set({
      status: "authenticated",
      principal: {
        subjectId: "david-1",
        organizationId: "org-contentoren",
        mode: "admin",
        organizationAdmin: true,
        method: "human_session",
        grants: [],
        issuedAt: 100,
        expiresAt: 200,
      },
      errorMessage: null,
    })

    organizationsReadResult = {
      success: true,
      data: {
        organizations: [
          { id: "org-contentoren", name: "Contentoren", current: true, mode: "admin", organizationAdmin: true },
          { id: "org-david", name: "David", current: false, mode: "admin", organizationAdmin: true },
        ],
        currentOrganizationId: "org-contentoren",
      },
    }

    switchCalls.length = 0
    navigatedTo = null

    const { state, dispose } = createRoot((d) => ({
      state: uiOrganizationSelectorStateCreate(),
      dispose: d,
    }))

    await flush()

    await state.switchOrganization("org-david")
    await flush()

    expect(switchCalls).toEqual(["org-david"])
    expect(uiSessionStore.get().principal?.organizationId).toBe("org-david")
    expect(navigatedTo as string | null).toBe("/")
    expect(navigateOptions).toEqual({ replace: true })

    dispose()
  })

  test("handles switch failure by showing error toast and keeping current state", async () => {
    uiToastStore.set([])
    uiSessionStore.set({
      status: "authenticated",
      principal: {
        subjectId: "david-1",
        organizationId: "org-contentoren",
        mode: "admin",
        organizationAdmin: true,
        method: "human_session",
        grants: [],
        issuedAt: 100,
        expiresAt: 200,
      },
      errorMessage: null,
    })

    organizationSwitchResult = {
      success: false,
      op: "authOrganizationSwitch",
      errorMessage: "The organization switch was denied",
    }

    switchCalls.length = 0

    const { state, dispose } = createRoot((d) => ({
      state: uiOrganizationSelectorStateCreate(),
      dispose: d,
    }))

    await flush()

    await state.switchOrganization("org-david")
    await flush()

    expect(uiSessionStore.get().principal?.organizationId).toBe("org-contentoren")
    expect(state.selectedOrganizationId()).toBe("org-contentoren")
    expect(uiToastStore.get()).toHaveLength(1)
    expect(uiToastStore.get()[0]?.tone).toBe("negative")
    expect(uiToastStore.get()[0]?.description).toBe("The organization switch was denied")

    dispose()
  })
})
