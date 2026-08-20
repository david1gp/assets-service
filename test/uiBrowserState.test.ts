import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import * as v from "valibot"

import { uiQueryCreate } from "../src/ui/query/uiQueryCreate.js"
import { uiSearchParamsReplace } from "../src/ui/search/uiSearchParamsReplace.js"
import { uiSessionStore } from "../src/ui/session/uiSessionStore.js"
import { uiFormDraftKeyCreate } from "../src/ui/storage/uiFormDraftKeyCreate.js"
import { uiFormDraftPersistenceCreate } from "../src/ui/storage/uiFormDraftPersistenceCreate.js"
import { uiLocalStorageRead } from "../src/ui/storage/uiLocalStorageRead.js"
import { uiLocalStorageWrite } from "../src/ui/storage/uiLocalStorageWrite.js"

const browserStateSchema = v.strictObject({ value: v.string() })

const storageCreate = () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } as unknown as Storage
  return { storage, values }
}

describe("uiLocalStorageRead", () => {
  test("reads only JSON values that match the supplied Valibot schema", () => {
    const { storage, values } = storageCreate()
    values.set("valid", JSON.stringify({ value: "cached" }))
    values.set("invalid-schema", JSON.stringify({ value: 1 }))
    values.set("invalid-json", "{")

    expect(uiLocalStorageRead("valid", browserStateSchema, storage)).toEqual({
      success: true,
      data: { value: "cached" },
    })
    expect(uiLocalStorageRead("missing", browserStateSchema, storage)).toEqual({ success: true, data: undefined })
    expect(uiLocalStorageRead("invalid-schema", browserStateSchema, storage).success).toBe(false)
    expect(uiLocalStorageRead("invalid-json", browserStateSchema, storage).success).toBe(false)
  })
})

describe("uiLocalStorageWrite", () => {
  test("debounces writes and supports idle-fallback removals", async () => {
    const { storage, values } = storageCreate()
    const first = uiLocalStorageWrite("draft", { value: "first" }, { storage, debounceMilliseconds: 5 })
    const second = uiLocalStorageWrite("draft", { value: "second" }, { storage, debounceMilliseconds: 5 })

    expect(values.has("draft")).toBe(false)
    expect((await first).success).toBe(true)
    expect((await second).success).toBe(true)
    expect(values.get("draft")).toBe(JSON.stringify({ value: "second" }))

    expect((await uiLocalStorageWrite("draft", null, { storage, debounceMilliseconds: 0 })).success).toBe(true)
    expect(values.has("draft")).toBe(false)
  })
})

describe("uiFormDraft", () => {
  test("scopes keys to the authenticated subject, entity, and form instance", () => {
    const previous = uiSessionStore.get()
    try {
      uiSessionStore.set({
        status: "authenticated",
        principal: {
          subjectId: "subject/1",
          organizationId: "organization/1",
          method: "human_session",
          grants: [{ projectId: "project-1", roles: ["assets.admin"] }],
          issuedAt: 0,
          expiresAt: 1,
        },
        errorMessage: null,
      })

      expect(uiFormDraftKeyCreate("project", "project/1", "settings")).toBe(
        "assets-service:ui-draft:project:organization%2F1:subject%2F1:project%2F1:settings",
      )
    } finally {
      uiSessionStore.set(previous)
    }
  })

  test("hydrates and validates drafts while delegating writes and clears to idle storage", async () => {
    const { storage, values } = storageCreate()
    const schema = v.strictObject({ value: v.string() })
    let value = { value: "unfinished" }
    const draft = uiFormDraftPersistenceCreate(
      () => "form-draft",
      schema,
      () => value,
      {
        storage,
        debounceMilliseconds: 5,
      },
    )

    expect((await draft.persist()).success).toBe(true)
    expect(draft.hydrate()).toEqual({ success: true, data: { value: "unfinished" } })
    values.set("form-draft", JSON.stringify({ value: 42 }))
    expect(draft.hydrate().success).toBe(false)
    values.set("form-draft", JSON.stringify({ value: "unfinished" }))
    value = { value: "updated" }
    expect((await draft.persist()).success).toBe(true)
    expect(draft.hydrate()).toEqual({ success: true, data: { value: "updated" } })
    expect((await draft.clear()).success).toBe(true)
    expect(values.has("form-draft")).toBe(false)
  })
})

describe("uiQueryCreate cache", () => {
  test("hydrates valid data before the remote refresh", () => {
    const { storage, values } = storageCreate()
    const cacheSchema = v.strictObject({ value: v.string() })
    values.set("query-cache", JSON.stringify({ value: "cached" }))

    const { query, dispose } = createRoot((rootDispose) => ({
      query: uiQueryCreate(async () => ({ success: true, data: { value: "fresh" } }) as const, {
        cacheKey: () => "query-cache",
        cacheSchema,
        storage,
      }),
      dispose: rootDispose,
    }))

    expect(query.data()).toEqual({ value: "cached" })
    expect(query.status()).toBe("ready")
    dispose()
  })
})

describe("uiSearchParamsReplace", () => {
  test("debounces keystrokes and preserves the current path and hash", async () => {
    const replacedUrls: string[] = []
    const options = {
      debounceMilliseconds: 5,
      location: { pathname: "/projects", hash: "#results" },
      replaceState: (url: string) => replacedUrls.push(url),
    }

    const first = uiSearchParamsReplace(new URLSearchParams({ search: "a" }), options)
    const second = uiSearchParamsReplace(new URLSearchParams({ search: "ab" }), options)

    expect(replacedUrls).toEqual([])
    expect((await first).success).toBe(true)
    expect((await second).success).toBe(true)
    expect(replacedUrls).toEqual(["/projects?search=ab#results"])
  })
})
