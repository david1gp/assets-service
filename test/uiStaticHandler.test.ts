import { describe, expect, test } from "bun:test"

import { uiStaticHandlerCreate } from "../src/entrypoints/uiStaticHandlerCreate.js"

const handlerCreate = (files: Readonly<Record<string, string>>) =>
  uiStaticHandlerCreate({
    rootDirectory: "/app/dist/ui",
    fileRead: (path) => ({
      exists: async () => path in files,
      bytes: async () => new TextEncoder().encode(files[path] ?? ""),
      type: "text/plain",
    }),
  })

const files = {
  "/app/dist/ui/index.html": "<!doctype html>app",
  "/app/dist/ui/assets/index.js": "console.log(1)",
}

describe("uiStaticHandlerCreate", () => {
  test("never handles API paths so API routes keep their own responses", async () => {
    const handle = handlerCreate(files)
    expect(await handle(new Request("https://assets.test/api/v1/projects"))).toBeNull()
  })

  test("serves built asset files with an immutable cache header", async () => {
    const handle = handlerCreate(files)
    const response = await handle(new Request("https://assets.test/assets/index.js"))
    expect(response?.status).toBe(200)
    expect(response?.headers.get("content-type")).toContain("text/javascript")
    expect(response?.headers.get("cache-control")).toContain("immutable")
  })

  test("falls back to the SPA document for deep links", async () => {
    const handle = handlerCreate(files)
    const response = await handle(new Request("https://assets.test/projects/p1/assets/a1"))
    expect(response?.status).toBe(200)
    expect(await response?.text()).toBe("<!doctype html>app")
  })

  test("returns null when the SPA has not been built", async () => {
    const handle = handlerCreate({})
    expect(await handle(new Request("https://assets.test/projects"))).toBeNull()
  })

  test("ignores non-read methods", async () => {
    const handle = handlerCreate(files)
    expect(await handle(new Request("https://assets.test/", { method: "POST" }))).toBeNull()
  })

  test("does not escape the build directory", async () => {
    const handle = handlerCreate({ ...files, "/app/secret.env": "TOKEN=1" })
    const response = await handle(new Request("https://assets.test/../secret.env"))
    expect(await response?.text()).toBe("<!doctype html>app")
  })
})
